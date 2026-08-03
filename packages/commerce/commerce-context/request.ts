import "server-only";

import {
  addressBookLayer,
  cartsLayer,
  commerceAccountsLayer,
  commerceIdentityLayer,
  productDiscoveryLayer,
} from "@repo/commerce/layers";
import type { Locale } from "@repo/i18n/types";
import { Effect, Layer } from "effect";
import { cookies } from "next/headers";
import { CartId } from "../domain/cart";
import { currentCartOperationFailure } from "../domain/cart-errors";
import {
  AnonymousCommerceContextRequest,
  CustomerCommerceContextRequest,
} from "../domain/commerce-request-context";
import {
  ANONYMOUS_CART_COOKIE_NAME,
  ANONYMOUS_CART_COOKIE_OPTIONS,
  encodeAnonymousCartCookie,
  getAnonymousCartIdFromCookieValue,
  makeAnonymousCartCookie,
} from "../lib/cart/utils/anonymous-cart-cookies";
import { CheckoutPolicies } from "../lib/checkout/checkout-policy";
import { CheckoutSession } from "../lib/checkout/checkout-session";
import type { CurrentCartCookie } from "../lib/current-cart/cookie";
import { CartPolicies } from "../services/cart-policies";
import { CommerceContext } from "../services/commerce-context";
import { CommerceIdentity } from "../services/commerce-identity";
import { CurrentCart } from "../services/current-cart";
import { CommerceLocale, resolveStore, type StoreKey } from "../store";
import {
  BUSINESS_UNIT_COOKIE_NAME,
  getBusinessUnitIdFromCookieValue,
} from "./business-unit-cookie";

export const commerceRequestLayer = async (
  locale: Locale,
  selectedStoreKey?: StoreKey
) => {
  const [cookieStore, identity] = await Promise.all([
    cookies(),
    commerceIdentityLayer(),
  ]);
  const store = resolveStore({
    locale: CommerceLocale.make(locale),
    ...(selectedStoreKey === undefined ? {} : { selectedStoreKey }),
  });
  const businessUnitId = getBusinessUnitIdFromCookieValue(
    cookieStore.get(BUSINESS_UNIT_COOKIE_NAME)?.value
  );
  const anonymousCartId = getAnonymousCartIdFromCookieValue(
    cookieStore.get(ANONYMOUS_CART_COOKIE_NAME)?.value,
    store
  );
  const currentCartCookie: CurrentCartCookie = {
    set: (cartId) =>
      Effect.try({
        try: () =>
          cookieStore.set(
            ANONYMOUS_CART_COOKIE_NAME,
            encodeAnonymousCartCookie(
              makeAnonymousCartCookie({ cartId, store })
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
  const commerceContext = Layer.unwrap(
    Effect.map(CommerceIdentity, ({ authUserId }) =>
      CommerceContext.layer(
        authUserId === undefined
          ? new AnonymousCommerceContextRequest({
              store,
              ...(anonymousCartId === null
                ? {}
                : { anonymousCartId: CartId.make(anonymousCartId) }),
            })
          : new CustomerCommerceContextRequest({
              store,
              authUserId,
              ...(businessUnitId === undefined ? {} : { businessUnitId }),
            })
      )
    )
  ).pipe(Layer.provide(identity), Layer.provide(commerceAccountsLayer));
  const currentCart = CurrentCart.layer(currentCartCookie).pipe(
    Layer.provide(
      Layer.mergeAll(cartsLayer, CartPolicies.layer, commerceContext)
    )
  );
  const addressBook = addressBookLayer.pipe(Layer.provide(commerceContext));
  const productDiscovery = productDiscoveryLayer.pipe(
    Layer.provide(commerceContext)
  );
  const checkoutSession = CheckoutSession.layer.pipe(
    Layer.provide(
      Layer.mergeAll(
        CheckoutPolicies.layer,
        commerceContext,
        currentCart,
        addressBook
      )
    )
  );

  return Layer.mergeAll(
    identity,
    commerceAccountsLayer,
    commerceContext,
    currentCart,
    addressBook,
    productDiscovery,
    checkoutSession
  );
};
