import "server-only";

import { withAuth } from "@repo/auth-workos/server";
import { CartId, StoreKey } from "@repo/commerce/domain/cart";
import { currentCartOperationFailure } from "@repo/commerce/domain/cart-errors";
import { CartStore } from "@repo/commerce/domain/cart-snapshot";
import { CheckoutLocale } from "@repo/commerce/domain/checkout";
import {
  AnonymousCommerceContextRequest,
  AuthUserId,
  type CommerceContextRequest,
  CustomerCommerceContextRequest,
} from "@repo/commerce/domain/commerce-request-context";
import {
  ANONYMOUS_CART_COOKIE_NAME,
  ANONYMOUS_CART_COOKIE_OPTIONS,
  encodeAnonymousCartCookie,
  getAnonymousCartIdFromCookieValue,
  makeAnonymousCartCookie,
} from "@repo/commerce/lib/cart/utils/anonymous-cart-cookies";
import { CheckoutPolicies } from "@repo/commerce/lib/checkout/checkout-policy";
import { CheckoutSession } from "@repo/commerce/lib/checkout/checkout-session";
import type { CurrentCartCookie } from "@repo/commerce/lib/current-cart/cookie";
import { layerCommercetoolsAddressBook } from "@repo/commerce/lib/infra/commercetools/address-book";
import { layerCommercetoolsCarts } from "@repo/commerce/lib/infra/commercetools/carts";
import { layerCommercetoolsCommerceAccounts } from "@repo/commerce/lib/infra/commercetools/commerce-accounts";
import { storeService } from "@repo/commerce/lib/store/store.service";
import { CartPolicies } from "@repo/commerce/services/cart-policies";
import { CommerceContext } from "@repo/commerce/services/commerce-context";
import { CurrentCart } from "@repo/commerce/services/current-cart";
import type { Locale } from "@repo/i18n/types";
import { Effect, Layer, Schema } from "effect";
import { cookies } from "next/headers";
import {
  BUSINESS_UNIT_COOKIE_NAME,
  getBusinessUnitIdFromCookieValue,
} from "./business-unit-cookie";

export class NextCommerceBoundaryFailure extends Schema.TaggedErrorClass<NextCommerceBoundaryFailure>()(
  "NextCommerceBoundaryFailure",
  {
    message: Schema.String,
    cause: Schema.Defect,
  }
) {}

const nextCommerceBoundaryFailure = (message: string, cause: unknown) =>
  new NextCommerceBoundaryFailure({ message, cause });

interface NextCommerceBoundary {
  readonly currentCartCookie: CurrentCartCookie;
  readonly commerceContextRequest: CommerceContextRequest;
}

const makeNextCommerceBoundary = (locale: Locale) =>
  Effect.gen(function* () {
    const storeContext = yield* Effect.tryPromise({
      try: () => storeService.getStoreContextByLocale(locale),
      catch: (cause) =>
        nextCommerceBoundaryFailure("Failed to resolve Store context", cause),
    });
    const store = new CartStore({
      locale: CheckoutLocale.make(locale),
      storeKey: StoreKey.make(storeContext.storeKey),
      currency: storeContext.currency,
    });
    const session = yield* Effect.tryPromise({
      try: () => withAuth(),
      catch: (cause) =>
        nextCommerceBoundaryFailure(
          "Failed to resolve authenticated session",
          cause
        ),
    });
    const cookieStore = yield* Effect.tryPromise({
      try: cookies,
      catch: (cause) =>
        nextCommerceBoundaryFailure("Failed to access Next.js cookies", cause),
    });

    if (session.user) {
      const authUserId = yield* Schema.decodeUnknownEffect(AuthUserId)(
        session.user.id
      ).pipe(
        Effect.mapError((cause) =>
          nextCommerceBoundaryFailure("Authenticated user id is invalid", cause)
        )
      );
      const businessUnitId = getBusinessUnitIdFromCookieValue(
        cookieStore.get(BUSINESS_UNIT_COOKIE_NAME)?.value
      );
      return {
        currentCartCookie: {
          set: () => Effect.void,
          clear: () => Effect.void,
        },
        commerceContextRequest: new CustomerCommerceContextRequest({
          store,
          authUserId,
          ...(businessUnitId === undefined ? {} : { businessUnitId }),
        }),
      } satisfies NextCommerceBoundary;
    }

    const anonymousCartId = getAnonymousCartIdFromCookieValue(
      cookieStore.get(ANONYMOUS_CART_COOKIE_NAME)?.value,
      storeContext
    );
    const currentCartCookie: CurrentCartCookie = {
      set: (cartId) =>
        Effect.try({
          try: () =>
            cookieStore.set(
              ANONYMOUS_CART_COOKIE_NAME,
              encodeAnonymousCartCookie(
                makeAnonymousCartCookie({ cartId, context: storeContext })
              ),
              ANONYMOUS_CART_COOKIE_OPTIONS
            ),
          catch: currentCartOperationFailure,
        }).pipe(Effect.asVoid),
      clear: () =>
        Effect.sync(() => cookieStore.delete(ANONYMOUS_CART_COOKIE_NAME)).pipe(
          Effect.catchDefect(() => Effect.void),
          Effect.asVoid
        ),
    };
    return {
      currentCartCookie,
      commerceContextRequest: new AnonymousCommerceContextRequest({
        store,
        ...(anonymousCartId === null
          ? {}
          : { anonymousCartId: CartId.make(anonymousCartId) }),
      }),
    } satisfies NextCommerceBoundary;
  }).pipe(Effect.withSpan("NextCommerceBoundary.make"));

const currentCartDependencies = Layer.merge(
  layerCommercetoolsCarts,
  CartPolicies.layer
);

const makeNextCommerceLayers = ({
  commerceContextRequest,
  currentCartCookie,
}: NextCommerceBoundary) => {
  const commerceContext = CommerceContext.layer(commerceContextRequest).pipe(
    Layer.provide(layerCommercetoolsCommerceAccounts)
  );
  const currentCart = CurrentCart.layer(currentCartCookie).pipe(
    Layer.provide(Layer.merge(currentCartDependencies, commerceContext))
  );

  return { commerceContext, currentCart } as const;
};

const nextCurrentCartLayerForBoundary = (boundary: NextCommerceBoundary) =>
  makeNextCommerceLayers(boundary).currentCart;

export const nextCurrentCartLayer = (locale: Locale) =>
  Layer.unwrap(
    makeNextCommerceBoundary(locale).pipe(
      Effect.map(nextCurrentCartLayerForBoundary)
    )
  );

const nextCheckoutLayerForBoundary = (boundary: NextCommerceBoundary) => {
  const { commerceContext, currentCart } = makeNextCommerceLayers(boundary);
  const addressBook = layerCommercetoolsAddressBook.pipe(
    Layer.provide(commerceContext)
  );
  return CheckoutSession.layer.pipe(
    Layer.provide(
      Layer.mergeAll(
        CheckoutPolicies.layer,
        commerceContext,
        currentCart,
        addressBook
      )
    ),
    Layer.merge(addressBook)
  );
};

export const nextCheckoutLayer = (locale: Locale) =>
  Layer.unwrap(
    makeNextCommerceBoundary(locale).pipe(
      Effect.map(nextCheckoutLayerForBoundary)
    )
  );
