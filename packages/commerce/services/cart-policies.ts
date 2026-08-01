import { Context, Effect, Layer } from "effect";
import type { CartPolicyFailure } from "../domain/cart-errors";
import type {
  CartPolicyViolation,
  CartSnapshot,
} from "../domain/cart-snapshot";

export interface CartPolicy {
  readonly name: string;
  readonly evaluate: (
    cart: CartSnapshot
  ) => Effect.Effect<readonly CartPolicyViolation[], CartPolicyFailure>;
}

const maximumGuestItems = 50;

export const guestMaximumItemsPolicy: CartPolicy = {
  name: "guest-max-limits",
  evaluate: Effect.fn("CartPolicies.guestMaximumItems")((cart) => {
    if (
      cart.buyingContext !== undefined ||
      cart.totalLineItemQuantity <= maximumGuestItems
    ) {
      return Effect.succeed([]);
    }

    let runningTotal = 0;
    const violations: CartPolicyViolation[] = [];
    for (const lineItem of cart.lineItems) {
      const previousTotal = runningTotal;
      runningTotal += lineItem.quantity;
      if (runningTotal <= maximumGuestItems) {
        continue;
      }
      const excessQuantity =
        runningTotal -
        maximumGuestItems -
        Math.max(previousTotal - maximumGuestItems, 0);
      if (excessQuantity <= 0) {
        continue;
      }
      violations.push({
        code: "MAX_GUEST_TOTAL_ITEMS_EXCEEDED",
        parameters: {
          maxQuantity: maximumGuestItems,
          totalQuantity: cart.totalLineItemQuantity,
          excessQuantity,
        },
        targets: [
          {
            type: "cartItem",
            lineItemId: lineItem.id,
            productId: lineItem.variant.productId,
            variantId: lineItem.variant.id,
            ...(lineItem.variant.sku === undefined
              ? {}
              : { sku: lineItem.variant.sku }),
          },
        ],
      });
    }
    return Effect.succeed(violations);
  }),
};

export class CartPolicies extends Context.Service<
  CartPolicies,
  {
    readonly evaluate: (
      cart: CartSnapshot
    ) => Effect.Effect<readonly CartPolicyViolation[], CartPolicyFailure>;
  }
>()("@repo/commerce/CartPolicies") {
  static readonly layerFrom = (policies: readonly CartPolicy[]) =>
    Layer.succeed(
      CartPolicies,
      CartPolicies.of({
        evaluate: Effect.fn("CartPolicies.evaluate")((cart) =>
          Effect.forEach(policies, (policy) => policy.evaluate(cart), {
            concurrency: "unbounded",
          }).pipe(Effect.map((violations) => violations.flat()))
        ),
      })
    );

  static readonly layerEmpty = CartPolicies.layerFrom([]);

  static readonly layer = CartPolicies.layerFrom([guestMaximumItemsPolicy]);
}
