import { Context, Effect, Layer } from "effect";
import type { CartForCheckout } from "../../domain/cart";
import {
  type CheckoutBuyerContext,
  type CheckoutContact,
  type CheckoutDeliveryDetails,
  type CheckoutDetails,
  CheckoutMutationUnsupported,
  type CheckoutPolicyViolation,
  type CheckoutProviderFailure,
  type CheckoutScope,
  type CheckoutState,
  CheckoutUnavailable,
} from "../../domain/checkout";
import type { PolicyViolation } from "../cart/policy/cart-policy.types";
import { buildCheckoutState } from "./state";

export interface SaveCheckoutContactInput {
  readonly scope: CheckoutScope;
  readonly cart: CartForCheckout;
  readonly contact: CheckoutContact;
}

export interface SaveCheckoutDeliveryDetailsInput {
  readonly scope: CheckoutScope;
  readonly cart: CartForCheckout;
  readonly deliveryDetails: CheckoutDeliveryDetails;
}

export interface CheckoutSessionMemoryInput {
  readonly currentCart?: CartForCheckout;
  readonly details?: CheckoutDetails;
  readonly buyerContext?: CheckoutBuyerContext;
  readonly cartPolicyViolations?: readonly PolicyViolation[];
  readonly checkoutPolicyViolations?: readonly CheckoutPolicyViolation[];
}

const guestBuyerContext: CheckoutBuyerContext = {
  buyerMode: "guest",
  requiresBuyingContext: false,
};

const unsupportedMutation = (
  operation: "saveContact" | "saveDeliveryDetails"
) =>
  new CheckoutMutationUnsupported({
    message: `${operation} is implemented by a later Checkout Session slice`,
    operation,
  });

export class CheckoutSession extends Context.Service<
  CheckoutSession,
  {
    readonly getCurrent: (
      scope: CheckoutScope
    ) => Effect.Effect<
      CheckoutState,
      CheckoutUnavailable | CheckoutProviderFailure
    >;
    readonly saveContact: (
      input: SaveCheckoutContactInput
    ) => Effect.Effect<void, CheckoutMutationUnsupported>;
    readonly saveDeliveryDetails: (
      input: SaveCheckoutDeliveryDetailsInput
    ) => Effect.Effect<void, CheckoutMutationUnsupported>;
  }
>()("@repo/commerce/checkout/CheckoutSession") {
  static readonly getCurrent = Effect.fn("CheckoutSession.getCurrent")(
    (scope: CheckoutScope) =>
      Effect.flatMap(CheckoutSession, (session) => session.getCurrent(scope))
  );

  static readonly saveContact = Effect.fn("CheckoutSession.saveContact")(
    (input: SaveCheckoutContactInput) =>
      Effect.flatMap(CheckoutSession, (session) => session.saveContact(input))
  );

  static readonly saveDeliveryDetails = Effect.fn(
    "CheckoutSession.saveDeliveryDetails"
  )((input: SaveCheckoutDeliveryDetailsInput) =>
    Effect.flatMap(CheckoutSession, (session) =>
      session.saveDeliveryDetails(input)
    )
  );

  static readonly layerMemoryFrom = ({
    currentCart,
    details = {},
    buyerContext = guestBuyerContext,
    cartPolicyViolations = [],
    checkoutPolicyViolations = [],
  }: CheckoutSessionMemoryInput) =>
    Layer.succeed(
      CheckoutSession,
      CheckoutSession.of({
        getCurrent: (scope) => {
          if (currentCart === undefined) {
            return Effect.fail(
              new CheckoutUnavailable({
                message: "Checkout requires an existing Cart",
                reason: "noCart",
              })
            );
          }

          return buildCheckoutState({
            scope,
            cart: currentCart,
            details,
            buyerContext,
            cartPolicyViolations,
            checkoutPolicyViolations,
          });
        },
        saveContact: () => Effect.fail(unsupportedMutation("saveContact")),
        saveDeliveryDetails: () =>
          Effect.fail(unsupportedMutation("saveDeliveryDetails")),
      })
    );
}
