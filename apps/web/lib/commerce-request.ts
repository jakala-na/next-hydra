/* oxlint-disable promise/prefer-await-to-callbacks, promise/prefer-await-to-then -- Effect combinators use callback APIs to transform Effect values. */
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
import { decodeCommerceAuthUserId } from "@repo/commerce/runtime/commerce-request";
import type { CommerceRequestInput } from "@repo/commerce/runtime/commerce-request";
import { CommerceLocale, resolveStore } from "@repo/commerce/store";
import type { StoreKey } from "@repo/commerce/store";
import type { Locale } from "@repo/i18n/types";
import { Effect } from "effect";

import {
  CurrentAuth,
  terminateAuthSessionReadFailure,
} from "./current-auth-api";
import type { NextCookieStore } from "./next-request-api";
import { NextRequestApi } from "./next-request-api";

export interface NextCommerceRequestOptions {
  readonly selectedStoreKey?: StoreKey;
}

export const makeCommerceRequest = (
  locale: Locale,
  cookieStore: NextCookieStore,
  authUserId: string | undefined,
  options?: NextCommerceRequestOptions
) => {
  const commerceLocale = CommerceLocale.make(locale);
  const store =
    options?.selectedStoreKey === undefined
      ? resolveStore({ locale: commerceLocale })
      : resolveStore({
          locale: commerceLocale,
          selectedStoreKey: options.selectedStoreKey,
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
      Effect.sync(() => {
        cookieStore.delete(ANONYMOUS_CART_COOKIE_NAME);
      }).pipe(
        Effect.catchDefect(() => Effect.void),
        Effect.asVoid
      ),
    set: (cartId) =>
      Effect.try({
        catch: currentCartOperationFailure,
        try: () => {
          cookieStore.set(
            ANONYMOUS_CART_COOKIE_NAME,
            encodeAnonymousCartCookie(
              makeAnonymousCartCookie({ cartId, store })
            ),
            ANONYMOUS_CART_COOKIE_OPTIONS
          );
        },
      }).pipe(
        Effect.tapError((error) =>
          Effect.logError("Failed to persist the anonymous cart cookie", error)
        ),
        Effect.orDie,
        Effect.asVoid
      ),
  };

  return decodeCommerceAuthUserId(authUserId).pipe(
    Effect.map((decodedAuthUserId): CommerceRequestInput => {
      if (decodedAuthUserId === undefined) {
        const anonymousContext: ConstructorParameters<
          typeof AnonymousCommerceContextRequest
        >[0] = { store };
        if (anonymousCartId !== null) {
          Object.assign(anonymousContext, {
            anonymousCartId: CartId.make(anonymousCartId),
          });
        }

        return {
          context: new AnonymousCommerceContextRequest(anonymousContext),
          currentCartCookie,
        };
      }

      const customerContext: ConstructorParameters<
        typeof CustomerCommerceContextRequest
      >[0] = {
        authUserId: decodedAuthUserId,
        store,
      };
      if (businessUnitId !== undefined) {
        Object.assign(customerContext, { businessUnitId });
      }

      return {
        context: new CustomerCommerceContextRequest(customerContext),
        currentCartCookie,
      };
    })
  );
};

export const makeNextCommerceRequest = (
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
  }).pipe(
    Effect.catchTags({
      AuthSessionReadFailure: terminateAuthSessionReadFailure,
      CommerceRequestFailure: (error) =>
        Effect.logError(
          "The authenticated user ID violated the Commerce request contract",
          error.cause
        ).pipe(
          Effect.annotateLogs({
            "commerce.error.tag": error._tag,
            "commerce.operation": error.operation,
          }),
          Effect.andThen(Effect.die(error))
        ),
    })
  );

export const nextCommerceRequest = makeNextCommerceRequest;
