import "server-only";

import { withAuth } from "@repo/auth/server";
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
import { CheckoutPolicies } from "@repo/commerce/lib/checkout/checkout-policy";
import type { CurrentCartCookie } from "@repo/commerce/lib/current-cart/cookie";
import {
  type CommerceRequestFailure,
  type CommerceRequestInput,
  decodeCommerceAuthUserId,
} from "@repo/commerce/runtime/commerce-request";
import {
  type CommerceRequestProvisionError,
  type CommerceRequestServices,
  type CommerceStableServices,
  makeCommerceApp,
} from "@repo/commerce/runtime/make-commerce-app";
import { CartPolicies } from "@repo/commerce/services/cart-policies";
import {
  CommerceLocale,
  resolveStore,
  type StoreKey,
} from "@repo/commerce/store";
import {
  addressBookLayer,
  cartsLayer,
  commerceAccountsLayer,
  productDiscoveryLayer,
} from "@repo/commerce-provider/provider";
import { getLocale } from "@repo/i18n";
import type { Locale } from "@repo/i18n/types";
import { Effect, Layer, ManagedRuntime } from "effect";
import { cookies } from "next/headers";
import { connection } from "next/server";

export const CommerceApp = makeCommerceApp({
  addressBookLayer: Layer.orDie(addressBookLayer),
  cartPoliciesLayer: CartPolicies.layer,
  cartsLayer: Layer.orDie(cartsLayer),
  checkoutPoliciesLayer: CheckoutPolicies.layer,
  commerceAccountsLayer: Layer.orDie(commerceAccountsLayer),
  productDiscoveryLayer: Layer.orDie(productDiscoveryLayer),
});

const CommerceRuntime = ManagedRuntime.make(CommerceApp.layer);

interface NextCommerceRequestOptions {
  readonly selectedStoreKey?: StoreKey;
}

const makeNextCommerceRequest = (
  locale: Locale,
  options?: NextCommerceRequestOptions
) =>
  Effect.promise(async () => {
    await connection();
    return Promise.all([cookies(), withAuth()]);
  }).pipe(
    Effect.flatMap(([cookieStore, session]) => {
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
          Effect.sync(() =>
            cookieStore.delete(ANONYMOUS_CART_COOKIE_NAME)
          ).pipe(
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

      return decodeCommerceAuthUserId(session.user?.id).pipe(
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
    })
  );

const provide =
  (locale: Locale, options?: NextCommerceRequestOptions) =>
  <A, E>(program: Effect.Effect<A, E, CommerceRequestServices>) =>
    makeNextCommerceRequest(locale, options).pipe(
      Effect.flatMap((request) => program.pipe(CommerceApp.provide(request)))
    );

type CommerceRequestError =
  | CommerceRequestFailure
  | CommerceRequestProvisionError;

interface NextCommerceBuildOptions<Args extends unknown[], A, E, B, E2> {
  readonly locale?: (...args: Args) => Locale | Promise<Locale>;
  readonly transform?: (
    effect: Effect.Effect<A, E | CommerceRequestError, CommerceStableServices>
  ) => Effect.Effect<B, E2, CommerceStableServices>;
}

function build<Args extends unknown[], A, E>(
  handler: (...args: Args) => Effect.Effect<A, E, CommerceRequestServices>,
  options?: {
    readonly locale?: (...args: Args) => Locale | Promise<Locale>;
  }
): (...args: Args) => Promise<A>;
function build<Args extends unknown[], A, E, B, E2>(
  handler: (...args: Args) => Effect.Effect<A, E, CommerceRequestServices>,
  options: NextCommerceBuildOptions<Args, A, E, B, E2> & {
    readonly transform: NonNullable<
      NextCommerceBuildOptions<Args, A, E, B, E2>["transform"]
    >;
  }
): (...args: Args) => Promise<B>;
function build<Args extends unknown[], A, E, B, E2>(
  handler: (...args: Args) => Effect.Effect<A, E, CommerceRequestServices>,
  options?: NextCommerceBuildOptions<Args, A, E, B, E2>
) {
  return async (...args: Args): Promise<A | B> => {
    const locale = await (options?.locale === undefined
      ? getLocale()
      : options.locale(...args));
    const effect = handler(...args).pipe(provide(locale));

    return options?.transform === undefined
      ? CommerceRuntime.runPromise(effect)
      : CommerceRuntime.runPromise(options.transform(effect));
  };
}

export const NextCommerce = {
  build,
  provide,
  runPromise: <A, E>(program: Effect.Effect<A, E, CommerceStableServices>) =>
    CommerceRuntime.runPromise(program),
};
