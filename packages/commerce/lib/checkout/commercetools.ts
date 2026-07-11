import type { Locale } from "@repo/i18n/types";
import { Effect, Layer } from "effect";
import {
  type CheckoutBuyerContext,
  type CheckoutDetails,
  CheckoutMutationProviderFailure,
  CheckoutMutationUnsupported,
  CheckoutProviderFailure,
  type CheckoutScope,
  CheckoutUnavailable,
  CheckoutVersionConflict,
} from "../../domain/checkout";
import { cartService } from "../cart/cart.service";
import { decodeCartForCheckout } from "../cart/cart-for-checkout";
import { hasPersistedCheckoutContact } from "../cart/checkout-contact-actions";
import { validateCartPolicies } from "../cart/utils/validate-cart";
import { StoreContexts } from "../store/store-contexts";
import type { Cart } from "../types";
import type { ActionResult } from "../utils/errors";
import { isOk } from "../utils/errors";
import {
  type CheckoutSaveContactFailure,
  CheckoutSession,
  contactSourceUnavailable,
  ensureCurrentCartReference,
  normalizeManualContact,
  type SaveCheckoutContactInput,
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
        try: () => cartService.getCustomerActiveCart(scope.customerId, locale),
        catch: (cause) =>
          cartRequestFailure("checkout.cart.getCustomerActiveCart", cause),
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

const getBuyerContext = (scope: CheckoutScope): CheckoutBuyerContext => ({
  buyerMode: scope.channel === "storefrontAnonymous" ? "guest" : "customer",
  requiresBuyingContext: false,
});

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

const unsupportedMutation = (operation: "saveDeliveryDetails") =>
  new CheckoutMutationUnsupported({
    message: `${operation} is implemented by a later Checkout Session slice`,
    operation,
  });

const saveCheckoutContact = (
  input: SaveCheckoutContactInput
): Effect.Effect<void, CheckoutSaveContactFailure> =>
  Effect.gen(function* () {
    const contact = yield* normalizeManualContact(input.contact);
    const allowedContactSources = allowedContactSourcesForCheckout(input.scope);

    if (!allowedContactSources.includes(contact.source)) {
      return yield* Effect.fail(contactSourceUnavailable(contact.source));
    }

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

export const layerCommercetoolsCheckoutSession = Layer.effect(
  CheckoutSession,
  Effect.gen(function* () {
    const storeContexts = yield* StoreContexts;

    return CheckoutSession.of({
      getCurrent: (scope) =>
        Effect.gen(function* () {
          yield* storeContexts.getForScope(scope);

          const { cart, providerCart } = yield* getCurrentCart(scope);
          const cartPolicyViolations = yield* evaluateCartPolicies(
            scope,
            providerCart
          );

          return yield* buildCheckoutState({
            scope,
            cart,
            details: getCheckoutDetails(providerCart),
            buyerContext: getBuyerContext(scope),
            allowedContactSources: allowedContactSourcesForCheckout(scope),
            cartPolicyViolations,
            checkoutPolicyViolations: [],
          });
        }),
      saveContact: saveCheckoutContact,
      saveDeliveryDetails: () =>
        Effect.fail(unsupportedMutation("saveDeliveryDetails")),
    });
  })
);

export const checkoutRuntimeLayerCommercetools =
  layerCommercetoolsCheckoutSession.pipe(
    Layer.provide(StoreContexts.layerCommercetools)
  );
