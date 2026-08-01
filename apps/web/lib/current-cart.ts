import "server-only";

import { withAuth } from "@repo/auth-workos/server";
import { CartId, StoreKey } from "@repo/commerce/domain/cart";
import { CurrentCartAssociationFailure } from "@repo/commerce/domain/cart-errors";
import { CartStore } from "@repo/commerce/domain/cart-snapshot";
import { CheckoutLocale } from "@repo/commerce/domain/checkout";
import {
  AnonymousCommercePrincipal,
  AuthUserId,
  CommerceRequestContext,
  CommerceRequestContextNotFound,
  CustomerCommercePrincipal,
} from "@repo/commerce/domain/commerce-request-context";
import {
  type AnonymousCartCookieContext,
  clearAnonymousCartId,
  getAnonymousCartId,
  setAnonymousCartId,
} from "@repo/commerce/lib/cart/utils/anonymous-cart-cookies";
import { CheckoutPolicies } from "@repo/commerce/lib/checkout/checkout-policy";
import { CheckoutSession } from "@repo/commerce/lib/checkout/checkout-session";
import type { CurrentCartRequest } from "@repo/commerce/lib/current-cart/request";
import { layerCommercetoolsAddressBook } from "@repo/commerce/lib/infra/commercetools/address-book";
import { layerCommercetoolsCarts } from "@repo/commerce/lib/infra/commercetools/carts";
import { layerCommercetoolsCommerceAccounts } from "@repo/commerce/lib/infra/commercetools/commerce-accounts";
import { storeService } from "@repo/commerce/lib/store/store.service";
import type { AddressBook } from "@repo/commerce/services/address-book";
import { CartPolicies } from "@repo/commerce/services/cart-policies";
import {
  type CommerceAccountError,
  CommerceAccounts,
} from "@repo/commerce/services/commerce-accounts";
import { CurrentCart } from "@repo/commerce/services/current-cart";
import type { Locale } from "@repo/i18n/types";
import { Effect, Layer, Schema } from "effect";

export class WebCheckoutContextResolutionFailure extends Schema.TaggedErrorClass<WebCheckoutContextResolutionFailure>()(
  "WebCheckoutContextResolutionFailure",
  {
    message: Schema.String,
    cause: Schema.Defect,
  }
) {}

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
  establish: () =>
    Effect.fail(
      associationFailure(
        "establish",
        new Error("Read-only Current Cart boundary cannot set cookies")
      )
    ),
  clear: () =>
    Effect.fail(
      associationFailure(
        "clear",
        new Error("Read-only Current Cart boundary cannot clear cookies")
      )
    ),
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

const resolveRequestDetails = Effect.fn("WebCurrentCart.resolveRequest")(
  function* (
    locale: Locale,
    association: CurrentCartAssociationBehavior
  ): Effect.fn.Return<
    {
      readonly request: CurrentCartRequest;
      readonly context: CommerceRequestContext | null;
    },
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

      const request = {
        _tag: "BusinessUnitCurrentCartRequest" as const,
        store,
        customerId,
        businessUnitId: businessUnit.businessUnitId,
        businessUnitKey: businessUnit.businessUnitKey,
      };
      return {
        request,
        context: new CommerceRequestContext({
          locale: store.locale,
          principal: new CustomerCommercePrincipal({
            authUserId,
            customerId,
            businessUnitId: businessUnit.businessUnitId,
            businessUnitKey: businessUnit.businessUnitKey,
          }),
        }),
      };
    }

    const possessedCartId = yield* Effect.tryPromise({
      try: () => getAnonymousCartId(storeContext),
      catch: (cause) =>
        contextResolutionFailure("Failed to read anonymous Cart cookie", cause),
    });
    const request: CurrentCartRequest = {
      _tag: "AnonymousCurrentCartRequest",
      store,
      ...(possessedCartId === null
        ? {}
        : { possessedCartId: CartId.make(possessedCartId) }),
      establish: (cartId) => association.establish(cartId, storeContext),
      clear: association.clear,
    };
    return {
      request,
      context:
        possessedCartId === null
          ? null
          : new CommerceRequestContext({
              locale: store.locale,
              principal: new AnonymousCommercePrincipal({
                anonymousCartId: CartId.make(possessedCartId),
              }),
            }),
    };
  }
);

export const resolveCurrentCartReadRequest = (locale: Locale) =>
  resolveRequestDetails(locale, readAssociation).pipe(
    Effect.map(({ request }) => request)
  );

export const resolveCurrentCartWriteRequest = (locale: Locale) =>
  resolveRequestDetails(locale, writeAssociation).pipe(
    Effect.map(({ request }) => request)
  );

const currentCartRuntime = (request: CurrentCartRequest) =>
  CurrentCart.layer(request).pipe(
    Layer.provide(Layer.merge(layerCommercetoolsCarts, CartPolicies.layer))
  );

const checkoutRuntime = (request: CurrentCartRequest) => {
  const dependencies = Layer.mergeAll(
    layerCommercetoolsCarts,
    CartPolicies.layer,
    CheckoutPolicies.layer,
    layerCommercetoolsCommerceAccounts,
    layerCommercetoolsAddressBook
  );
  const currentCart = CurrentCart.layer(request).pipe(
    Layer.provide(dependencies)
  );
  const checkoutSession = CheckoutSession.layer.pipe(
    Layer.provide(Layer.merge(dependencies, currentCart))
  );
  return Layer.mergeAll(dependencies, currentCart, checkoutSession);
};

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

const runCheckoutProgram = <A, E>(
  locale: Locale,
  program: Effect.Effect<A, E, CheckoutSession | AddressBook>,
  resolve: (
    requestedLocale: Locale
  ) => Effect.Effect<CurrentCartRequest, unknown, CommerceAccounts>
) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const request = yield* resolve(locale);
      return yield* program.pipe(Effect.provide(checkoutRuntime(request)));
    }).pipe(Effect.provide(layerCommercetoolsCommerceAccounts))
  );

export const runCheckoutRead = <A, E>(
  locale: Locale,
  program: Effect.Effect<A, E, CheckoutSession | AddressBook>
) => runCheckoutProgram(locale, program, resolveCurrentCartReadRequest);

export const runCheckoutWrite = <A, E>(
  locale: Locale,
  program: Effect.Effect<A, E, CheckoutSession | AddressBook>
) => runCheckoutProgram(locale, program, resolveCurrentCartWriteRequest);

type CheckoutProgramRunner = <A, E>(
  program: Effect.Effect<A, E, CheckoutSession | AddressBook>
) => Promise<A>;

export type WebCurrentCartRequestResolutionFailure =
  | CommerceAccountError
  | CommerceRequestContextNotFound
  | WebCheckoutContextResolutionFailure;

const runCheckoutWithContext = async <A>(
  locale: Locale,
  association: CurrentCartAssociationBehavior,
  use: (
    context: CommerceRequestContext | null,
    run: CheckoutProgramRunner
  ) => Promise<A>,
  onResolutionFailure?: (
    error: Exclude<
      WebCurrentCartRequestResolutionFailure,
      CommerceRequestContextNotFound
    >
  ) => Promise<A> | A
) => {
  const resolved = await Effect.runPromise(
    resolveRequestDetails(locale, association).pipe(
      Effect.provide(layerCommercetoolsCommerceAccounts),
      Effect.result
    )
  );
  if (resolved._tag === "Failure") {
    if (resolved.failure._tag === "CommerceRequestContextNotFound") {
      return use(null, () => Effect.runPromise(Effect.fail(resolved.failure)));
    }
    if (onResolutionFailure !== undefined) {
      return onResolutionFailure(resolved.failure);
    }
    return Effect.runPromise(Effect.fail(resolved.failure));
  }
  const { context, request } = resolved.success;
  const run: CheckoutProgramRunner = (program) =>
    Effect.runPromise(program.pipe(Effect.provide(checkoutRuntime(request))));
  return use(context, run);
};

export const runCheckoutReadWithContext = <A>(
  locale: Locale,
  use: (
    context: CommerceRequestContext | null,
    run: CheckoutProgramRunner
  ) => Promise<A>,
  onResolutionFailure?: (
    error: Exclude<
      WebCurrentCartRequestResolutionFailure,
      CommerceRequestContextNotFound
    >
  ) => Promise<A> | A
) => runCheckoutWithContext(locale, readAssociation, use, onResolutionFailure);

export const runCheckoutWriteWithContext = <A>(
  locale: Locale,
  use: (
    context: CommerceRequestContext | null,
    run: CheckoutProgramRunner
  ) => Promise<A>,
  onResolutionFailure?: (
    error: Exclude<
      WebCurrentCartRequestResolutionFailure,
      CommerceRequestContextNotFound
    >
  ) => Promise<A> | A
) => runCheckoutWithContext(locale, writeAssociation, use, onResolutionFailure);
