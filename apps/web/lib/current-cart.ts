import "server-only";

import { withAuth } from "@repo/auth-workos/server";
import { CartId, StoreKey } from "@repo/commerce/domain/cart";
import { CurrentCartAssociationFailure } from "@repo/commerce/domain/cart-errors";
import { CartStore } from "@repo/commerce/domain/cart-snapshot";
import { CheckoutLocale } from "@repo/commerce/domain/checkout";
import {
  AuthUserId,
  CommerceRequestContextNotFound,
} from "@repo/commerce/domain/commerce-request-context";
import {
  type AnonymousCartCookieContext,
  clearAnonymousCartId,
  getAnonymousCartId,
  setAnonymousCartId,
} from "@repo/commerce/lib/cart/utils/anonymous-cart-cookies";
import type { CurrentCartRequest } from "@repo/commerce/lib/current-cart/request";
import { layerCommercetoolsCarts } from "@repo/commerce/lib/infra/commercetools/carts";
import { layerCommercetoolsCommerceAccounts } from "@repo/commerce/lib/infra/commercetools/commerce-accounts";
import { storeService } from "@repo/commerce/lib/store/store.service";
import { CartPolicies } from "@repo/commerce/services/cart-policies";
import {
  type CommerceAccountError,
  CommerceAccounts,
} from "@repo/commerce/services/commerce-accounts";
import { CurrentCart } from "@repo/commerce/services/current-cart";
import type { Locale } from "@repo/i18n/types";
import { Effect, Layer, Schema } from "effect";
import { WebCheckoutContextResolutionFailure } from "./checkout-scope";

const contextResolutionFailure = (message: string, cause: unknown) =>
  new WebCheckoutContextResolutionFailure({ message, cause });

const associationFailure = (operation: "establish" | "clear", cause: unknown) =>
  new CurrentCartAssociationFailure({ operation, cause });

interface CurrentCartAssociationBehavior {
  readonly establish: (
    cartId: CartId,
    context: AnonymousCartCookieContext
  ) => Effect.Effect<void, CurrentCartAssociationFailure>;
  readonly clear: () => Effect.Effect<void, CurrentCartAssociationFailure>;
}

const readAssociation: CurrentCartAssociationBehavior = {
  establish: () => Effect.void,
  clear: () => Effect.void,
};

const writeAssociation: CurrentCartAssociationBehavior = {
  establish: (cartId, context) =>
    Effect.tryPromise({
      try: () => setAnonymousCartId(cartId, context),
      catch: (cause) => associationFailure("establish", cause),
    }),
  clear: () =>
    Effect.tryPromise({
      try: clearAnonymousCartId,
      catch: (cause) => associationFailure("clear", cause),
    }),
};

const resolveRequest = Effect.fn("WebCurrentCart.resolveRequest")(function* (
  locale: Locale,
  association: CurrentCartAssociationBehavior
): Effect.fn.Return<
  CurrentCartRequest,
  | CommerceAccountError
  | CommerceRequestContextNotFound
  | WebCheckoutContextResolutionFailure,
  CommerceAccounts
> {
  const storeContext = yield* Effect.tryPromise({
    try: () => storeService.getStoreContextByLocale(locale),
    catch: (cause) =>
      contextResolutionFailure("Failed to resolve Store context", cause),
  });
  const store = new CartStore({
    locale: CheckoutLocale.make(locale),
    storeKey: StoreKey.make(storeContext.storeKey),
    currency: storeContext.currency,
  });
  const session = yield* Effect.tryPromise({
    try: () => withAuth(),
    catch: (cause) =>
      contextResolutionFailure(
        "Failed to resolve authenticated session",
        cause
      ),
  });

  if (session.user) {
    const authUserId = yield* Schema.decodeUnknownEffect(AuthUserId)(
      session.user.id
    ).pipe(
      Effect.mapError((cause) =>
        contextResolutionFailure("Authenticated user id is invalid", cause)
      )
    );
    const accounts = yield* CommerceAccounts;
    const customerId = yield* accounts
      .getCustomerIdByAuthUserId(authUserId)
      .pipe(
        Effect.catchTag(
          "CommerceCustomerIdNotFound",
          () =>
            new CommerceRequestContextNotFound({
              message: "Commerce customer mapping does not exist",
              reason: "noCustomerMapping",
            })
        )
      );
    const businessUnit = yield* accounts
      .getBusinessUnitContextForCustomerInStore(customerId, store.storeKey)
      .pipe(
        Effect.catchTags({
          CommerceBusinessUnitContextNotFound: () =>
            new CommerceRequestContextNotFound({
              message:
                "Commerce Business Unit context does not exist for customer in Store",
              reason: "noBuyingContext",
            }),
          CommerceBusinessUnitContextAmbiguous: () =>
            new CommerceRequestContextNotFound({
              message:
                "Commerce Business Unit context is ambiguous for customer in Store",
              reason: "noBuyingContext",
            }),
        })
      );

    return {
      _tag: "BusinessUnitCurrentCartRequest",
      store,
      customerId,
      businessUnitId: businessUnit.businessUnitId,
      businessUnitKey: businessUnit.businessUnitKey,
    };
  }

  const possessedCartId = yield* Effect.tryPromise({
    try: () => getAnonymousCartId(storeContext),
    catch: (cause) =>
      contextResolutionFailure("Failed to read anonymous Cart cookie", cause),
  });
  return {
    _tag: "AnonymousCurrentCartRequest",
    store,
    ...(possessedCartId === null
      ? {}
      : { possessedCartId: CartId.make(possessedCartId) }),
    establish: (cartId) => association.establish(cartId, storeContext),
    clear: association.clear,
  };
});

export const resolveCurrentCartReadRequest = (locale: Locale) =>
  resolveRequest(locale, readAssociation);

export const resolveCurrentCartWriteRequest = (locale: Locale) =>
  resolveRequest(locale, writeAssociation);

const currentCartRuntime = (request: CurrentCartRequest) =>
  CurrentCart.layer(request).pipe(
    Layer.provide(Layer.merge(layerCommercetoolsCarts, CartPolicies.layer))
  );

const runCurrentCartProgram = <A, E>(
  locale: Locale,
  program: Effect.Effect<A, E, CurrentCart>,
  resolve: (
    requestedLocale: Locale
  ) => Effect.Effect<CurrentCartRequest, unknown, CommerceAccounts>
) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const request = yield* resolve(locale);
      return yield* program.pipe(Effect.provide(currentCartRuntime(request)));
    }).pipe(Effect.provide(layerCommercetoolsCommerceAccounts))
  );

export const runCurrentCartRead = <A, E>(
  locale: Locale,
  program: Effect.Effect<A, E, CurrentCart>
) => runCurrentCartProgram(locale, program, resolveCurrentCartReadRequest);

export const runCurrentCartWrite = <A, E>(
  locale: Locale,
  program: Effect.Effect<A, E, CurrentCart>
) => runCurrentCartProgram(locale, program, resolveCurrentCartWriteRequest);
