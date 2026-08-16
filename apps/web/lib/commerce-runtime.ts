import "server-only";
import {
  BUSINESS_UNIT_COOKIE_NAME,
  getBusinessUnitIdFromCookieValue,
} from "@repo/commerce/commerce-context/business-unit-cookie";
import { CartId } from "@repo/commerce/domain/cart";
import { currentCartOperationFailure } from "@repo/commerce/domain/cart-errors";
import {
  AnonymousCommerceContextRequest,
  CustomerCommerceContextRequest,
} from "@repo/commerce/domain/commerce-request-context";
import {
  ANONYMOUS_CART_COOKIE_NAME,
  ANONYMOUS_CART_COOKIE_OPTIONS,
  encodeAnonymousCartCookie,
  getAnonymousCartIdFromCookieValue,
  makeAnonymousCartCookie,
} from "@repo/commerce/lib/cart/utils/anonymous-cart-cookies";
import type { CurrentCartCookie } from "@repo/commerce/lib/current-cart/cookie";
import {
  CommerceRequestFailure,
  decodeCommerceAuthUserId,
} from "@repo/commerce/runtime/commerce-request";
import type { CommerceRequestInput } from "@repo/commerce/runtime/commerce-request";
import type {
  CommerceRequestProvisionError,
  CommerceRequestServices,
  CommerceStableServices,
} from "@repo/commerce/runtime/make-commerce-app";
import { CommerceAccountError } from "@repo/commerce/services/commerce-accounts";
import { CommerceLocale, resolveStore } from "@repo/commerce/store";
import type { StoreKey } from "@repo/commerce/store";
import type { Locale } from "@repo/i18n/types";
import { Effect, Layer, Schema } from "effect";

import { Actions } from "./actions";
import { AppRuntime, CommerceApp } from "./app-runtime";
import { CurrentAuth } from "./current-auth";
import { NextRequestApi } from "./next-request";
import type { NextCookieStore } from "./next-request";

export { CommerceApp } from "./app-runtime";

interface NextCommerceRequestOptions {
  readonly selectedStoreKey?: StoreKey;
}

const makeCommerceRequest = (
  locale: Locale,
  cookieStore: NextCookieStore,
  authUserId: string | undefined,
  options?: NextCommerceRequestOptions
) => {
  const store = resolveStore({
    locale: CommerceLocale.make(locale),
    ...(options?.selectedStoreKey === undefined
      ? {}
      : { selectedStoreKey: options.selectedStoreKey }),
  });
  const businessUnitId = getBusinessUnitIdFromCookieValue(
    cookieStore.get(BUSINESS_UNIT_COOKIE_NAME)?.value
  );
  const anonymousCartId = getAnonymousCartIdFromCookieValue(
    cookieStore.get(ANONYMOUS_CART_COOKIE_NAME)?.value,
    store
  );
  const currentCartCookie: CurrentCartCookie = {
    clear: () =>
      Effect.sync(() => cookieStore.delete(ANONYMOUS_CART_COOKIE_NAME)).pipe(
        Effect.catchDefect(() => Effect.void),
        Effect.asVoid
      ),
    set: (cartId) =>
      Effect.try({
        catch: currentCartOperationFailure,
        try: () =>
          cookieStore.set(
            ANONYMOUS_CART_COOKIE_NAME,
            encodeAnonymousCartCookie(
              makeAnonymousCartCookie({ cartId, store })
            ),
            ANONYMOUS_CART_COOKIE_OPTIONS
          ),
      }).pipe(Effect.asVoid),
  };

  return decodeCommerceAuthUserId(authUserId).pipe(
    Effect.map(
      (authUserId): CommerceRequestInput => ({
        context:
          authUserId === undefined
            ? new AnonymousCommerceContextRequest({
                store,
                ...(anonymousCartId === null
                  ? {}
                  : { anonymousCartId: CartId.make(anonymousCartId) }),
              })
            : new CustomerCommerceContextRequest({
                authUserId,
                store,
                ...(businessUnitId === undefined ? {} : { businessUnitId }),
              }),
        currentCartCookie,
      })
    )
  );
};

const makeNextCommerceRequest = (
  locale: Locale,
  options?: NextCommerceRequestOptions
) =>
  Effect.gen(function* makeNextCommerceRequestEffect() {
    const request = yield* NextRequestApi;
    const auth = yield* CurrentAuth;
    yield* request.connect();
    const [cookieStore, currentAuth] = yield* Effect.all([
      request.getCookies(),
      auth.snapshot,
    ]);

    return yield* makeCommerceRequest(
      locale,
      cookieStore,
      currentAuth.userId,
      options
    );
  });

type CommerceRuntimeServices =
  | CommerceStableServices
  | CurrentAuth
  | NextRequestApi;

export type NextCommerceRequestError =
  | CommerceRequestFailure
  | CommerceRequestProvisionError;

const logCommerceRequestCause = (error: unknown) => {
  if (Schema.is(CommerceRequestFailure)(error)) {
    return Effect.logError(
      "Failed to decode the Commerce auth user ID",
      error.cause
    ).pipe(
      Effect.annotateLogs({
        "commerce.error.tag": error._tag,
        "commerce.operation": error.operation,
      })
    );
  }

  if (Schema.is(CommerceAccountError)(error) && error.cause !== undefined) {
    return Effect.logError(error.message, error.cause).pipe(
      Effect.annotateLogs({
        "commerce.error.tag": error._tag,
      })
    );
  }

  return Effect.void;
};

const provide =
  (locale: Locale, options?: NextCommerceRequestOptions) =>
  <A, E>(program: Effect.Effect<A, E, CommerceRequestServices>) =>
    makeNextCommerceRequest(locale, options).pipe(
      Effect.flatMap((request) => program.pipe(CommerceApp.provide(request))),
      Effect.tapError(logCommerceRequestCause)
    );

export const CommerceActions = Actions.provide(({ locale }) =>
  Layer.unwrap(
    makeNextCommerceRequest(locale).pipe(
      Effect.tapError(logCommerceRequestCause),
      Effect.map((request) =>
        CommerceApp.requestLayer(request).pipe(
          Layer.tapError(logCommerceRequestCause)
        )
      )
    )
  )
);

export const NextCommerce = {
  provide,
  runPromise: async <A, E>(
    program: Effect.Effect<A, E, CommerceRuntimeServices>
  ) => await AppRuntime.runPromise(program),
};
