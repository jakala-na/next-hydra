import type { Locale } from "@repo/i18n/types";
import { type Context, Effect, Layer } from "effect";
import {
  type CheckoutBuyerContext,
  type CheckoutDetails,
  CheckoutMutationProviderFailure,
  CheckoutProviderFailure,
  type CheckoutScope,
  CheckoutUnavailable,
  CheckoutVersionConflict,
} from "../../domain/checkout";
import { CommerceAccounts } from "../../services/commerce-accounts";
import { cartService } from "../cart/cart.service";
import { decodeCartForCheckout } from "../cart/cart-for-checkout";
import { hasPersistedCheckoutContact } from "../cart/checkout-contact-actions";
import { hasPersistedCheckoutDeliveryDetails } from "../cart/checkout-delivery-details-actions";
import { validateCartPolicies } from "../cart/utils/validate-cart";
import { layerCommercetoolsCommerceAccounts } from "../infra/commercetools/commerce-accounts";
import { StoreContexts } from "../store/store-contexts";
import type { Cart } from "../types";
import type { ActionResult } from "../utils/errors";
import { isOk } from "../utils/errors";
import { CheckoutPolicies } from "./checkout-policy";
import {
  type CheckoutSaveContactFailure,
  type CheckoutSaveDeliveryDetailsFailure,
  CheckoutSession,
  contactSourceUnavailable,
  ensureCurrentCartReference,
  normalizeNewAddressDeliveryDetails,
  resolveCheckoutContact,
  type SaveCheckoutContactInput,
  type SaveCheckoutDeliveryDetailsInput,
} from "./checkout-session";
import { allowedContactSourcesForCheckout } from "./contact-source-policy";
import { buildCheckoutState } from "./state";

const localeFromScope = (scope: CheckoutScope) => scope.locale as Locale;

const cartRequestFailure = (operation: string, cause: unknown) =>
  new CheckoutProviderFailure({
    message: "Failed to resolve Checkout Cart",
    operation,
    cause,
  });

const getCartForScope = (
  scope: CheckoutScope
): Effect.Effect<
  ActionResult<Cart>,
  CheckoutProviderFailure | CheckoutUnavailable
> => {
  const locale = localeFromScope(scope);

  switch (scope.channel) {
    case "storefrontAnonymous":
      if (!scope.anonymousCartId) {
        return Effect.fail(
          new CheckoutUnavailable({
            message: "Checkout requires an existing Cart",
            reason: "noCart",
          })
        );
      }
      {
        const anonymousCartId = scope.anonymousCartId;

        return Effect.tryPromise({
          try: () => cartService.getCartById(anonymousCartId, locale),
          catch: (cause) => cartRequestFailure("checkout.cart.getById", cause),
        });
      }
    case "storefrontCustomer":
      return Effect.tryPromise({
        try: () =>
          cartService.getActiveCartForAssociateScope({
            associateId: scope.customerId,
            businessUnitKey: scope.businessUnitKey,
            locale,
          }),
        catch: (cause) =>
          cartRequestFailure("checkout.cart.getActiveForAssociateScope", cause),
      });
    default:
      scope satisfies never;
      return Effect.fail(
        new CheckoutUnavailable({
          message: "Checkout scope is unsupported",
          reason: "inaccessibleCart",
        })
      );
  }
};

const decodeCurrentCart = (cart: Cart) =>
  decodeCartForCheckout(cart).pipe(
    Effect.mapError(
      (cause) =>
        new CheckoutProviderFailure({
          message: "Failed to decode Cart for Checkout",
          operation: "checkout.cart.decodeForCheckout",
          cause,
        })
    )
  );

const getCurrentCart = (scope: CheckoutScope) =>
  Effect.gen(function* () {
    const result = yield* getCartForScope(scope);

    if (isOk(result)) {
      const cart = yield* decodeCurrentCart(result.data);
      return {
        cart,
        providerCart: result.data,
      };
    }

    if (result.error.code === "NOT_FOUND") {
      return yield* Effect.fail(
        new CheckoutUnavailable({
          message: "Checkout requires an existing Cart",
          reason: "noCart",
        })
      );
    }

    return yield* Effect.fail(
      new CheckoutProviderFailure({
        message: result.error.message,
        operation: "checkout.cart.getCurrent",
        cause: result.error,
      })
    );
  });

const getBuyerContext = (
  scope: CheckoutScope,
  cart: Pick<Cart, "businessUnitId">
): CheckoutBuyerContext => {
  if (scope.channel === "storefrontAnonymous") {
    return {
      buyerMode: "guest",
      requiresBuyingContext: false,
    };
  }

  return {
    buyerMode: "b2bCustomer",
    requiresBuyingContext: true,
    ...(cart.businessUnitId === undefined
      ? {}
      : {
          buyingContext: {
            businessUnitId: cart.businessUnitId,
          },
        }),
  };
};

const getCheckoutDetails = (
  cart: Pick<Cart, "checkoutDetails">
): CheckoutDetails => cart.checkoutDetails ?? {};

const evaluateCartPolicies = (scope: CheckoutScope, cart: Cart) =>
  Effect.tryPromise({
    try: () =>
      validateCartPolicies({
        cart,
        locale: localeFromScope(scope),
        ...(cart.customerId === undefined
          ? {}
          : { customerId: cart.customerId }),
      }),
    catch: (cause) =>
      new CheckoutProviderFailure({
        message: "Failed to evaluate Cart Policy for Checkout",
        operation: "checkout.cartPolicy.evaluate",
        cause,
      }),
  });

const saveCheckoutContact = (
  commerceAccounts: Context.Service.Shape<typeof CommerceAccounts>,
  input: SaveCheckoutContactInput
): Effect.Effect<void, CheckoutSaveContactFailure> =>
  Effect.gen(function* () {
    const allowedContactSources = allowedContactSourcesForCheckout(input.scope);

    if (!allowedContactSources.includes(input.contact.source)) {
      return yield* Effect.fail(contactSourceUnavailable(input.contact.source));
    }

    const contact = yield* resolveCheckoutContact(
      input.scope,
      input.contact,
      commerceAccounts
    );

    const { cart, providerCart } = yield* getCurrentCart(input.scope).pipe(
      Effect.mapError((error) =>
        error._tag === "CheckoutUnavailable"
          ? error
          : new CheckoutMutationProviderFailure({
              message: error.message,
              operation: error.operation,
            })
      )
    );
    yield* ensureCurrentCartReference(cart, input.cart);

    if (hasPersistedCheckoutContact(providerCart, contact)) {
      return;
    }

    const result = yield* Effect.tryPromise({
      try: () =>
        cartService.saveCheckoutContact({
          cart: providerCart,
          contact,
          locale: localeFromScope(input.scope),
          scope: input.scope,
        }),
      catch: (cause) =>
        new CheckoutMutationProviderFailure({
          message: "Failed to save checkout contact",
          operation: "checkout.contact.save",
          cause,
        }),
    });

    if (isOk(result)) {
      return;
    }

    if (result.error.code === "CONFLICT") {
      return yield* Effect.fail(
        new CheckoutVersionConflict({
          message: result.error.message,
          cartId: cart.id,
        })
      );
    }

    return yield* Effect.fail(
      new CheckoutMutationProviderFailure({
        message: result.error.message,
        operation: "checkout.contact.save",
        cause: result.error,
      })
    );
  });

const saveCheckoutDeliveryDetails = (
  input: SaveCheckoutDeliveryDetailsInput
): Effect.Effect<void, CheckoutSaveDeliveryDetailsFailure> =>
  Effect.gen(function* () {
    const deliveryDetails = yield* normalizeNewAddressDeliveryDetails(
      input.deliveryDetails
    );
    const { cart, providerCart } = yield* getCurrentCart(input.scope).pipe(
      Effect.mapError((error) =>
        error._tag === "CheckoutUnavailable"
          ? error
          : new CheckoutMutationProviderFailure({
              message: error.message,
              operation: error.operation,
            })
      )
    );
    yield* ensureCurrentCartReference(cart, input.cart, "Delivery Details");

    if (hasPersistedCheckoutDeliveryDetails(providerCart, deliveryDetails)) {
      return;
    }

    const result = yield* Effect.tryPromise({
      try: () =>
        cartService.saveCheckoutDeliveryDetails({
          cart: providerCart,
          deliveryDetails,
          locale: localeFromScope(input.scope),
          scope: input.scope,
        }),
      catch: (cause) =>
        new CheckoutMutationProviderFailure({
          message: "Failed to save checkout delivery details",
          operation: "checkout.deliveryDetails.save",
          cause,
        }),
    });

    if (isOk(result)) {
      return;
    }

    if (result.error.code === "CONFLICT") {
      return yield* Effect.fail(
        new CheckoutVersionConflict({
          message: result.error.message,
          cartId: cart.id,
        })
      );
    }

    return yield* Effect.fail(
      new CheckoutMutationProviderFailure({
        message: result.error.message,
        operation: "checkout.deliveryDetails.save",
        cause: result.error,
      })
    );
  });

export const layerCommercetoolsCheckoutSession = Layer.effect(
  CheckoutSession,
  Effect.gen(function* () {
    const storeContexts = yield* StoreContexts;
    const checkoutPolicies = yield* CheckoutPolicies;
    const commerceAccounts = yield* CommerceAccounts;

    return CheckoutSession.of({
      getCurrent: (scope) =>
        Effect.gen(function* () {
          yield* storeContexts.getForScope(scope);

          const { cart, providerCart } = yield* getCurrentCart(scope);
          const cartPolicyViolations = yield* evaluateCartPolicies(
            scope,
            providerCart
          );
          const details = getCheckoutDetails(providerCart);
          const buyerContext = getBuyerContext(scope, providerCart);
          const checkoutPolicyViolations = yield* checkoutPolicies.evaluate({
            cart,
            details,
            buyerContext,
          });

          return yield* buildCheckoutState({
            scope,
            cart,
            details,
            buyerContext,
            allowedContactSources: allowedContactSourcesForCheckout(scope),
            cartPolicyViolations,
            checkoutPolicyViolations,
          });
        }),
      saveContact: (input) => saveCheckoutContact(commerceAccounts, input),
      saveDeliveryDetails: saveCheckoutDeliveryDetails,
    });
  })
);

export const checkoutRuntimeLayerCommercetools =
  layerCommercetoolsCheckoutSession.pipe(
    Layer.provide(
      Layer.mergeAll(StoreContexts.layerCommercetools, CheckoutPolicies.layer)
    ),
    Layer.provideMerge(layerCommercetoolsCommerceAccounts)
  );
