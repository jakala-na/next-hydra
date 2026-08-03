import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { CartId, LineItemId, ProductId, VariantId } from "../domain/cart";
import { CartPolicyFailure } from "../domain/cart-errors";
import type { CartSnapshot } from "../domain/cart-snapshot";
import { StoreKey } from "../store";
import { CartPolicies } from "./cart-policies";

const cart: CartSnapshot = {
  id: CartId.make("cart-1"),
  status: "active",
  storeKey: StoreKey.make("us-store"),
  lineItems: [],
  totalLineItemQuantity: 0,
  totalPrice: { centAmount: 0, currencyCode: "USD" },
  checkoutDetails: {},
};
const quantityOverGuestLimit = 51;
const unitPriceCentAmount = 100;
const maximumGuestItems = 50;

describe("CartPolicies", () => {
  it.effect(
    "reports the existing guest maximum-items rule as violation data",
    () =>
      Effect.gen(function* () {
        const policies = yield* CartPolicies;
        const violations = yield* policies.evaluate({
          ...cart,
          lineItems: [
            {
              id: LineItemId.make("line-1"),
              variant: {
                id: VariantId.make("variant-1"),
                productId: ProductId.make("product-1"),
                images: [],
                attributes: {},
              },
              quantity: quantityOverGuestLimit,
              unitPrice: {
                centAmount: unitPriceCentAmount,
                currencyCode: "USD",
              },
              totalPrice: {
                centAmount: unitPriceCentAmount * quantityOverGuestLimit,
                currencyCode: "USD",
              },
            },
          ],
          totalLineItemQuantity: quantityOverGuestLimit,
          totalPrice: {
            centAmount: unitPriceCentAmount * quantityOverGuestLimit,
            currencyCode: "USD",
          },
        });

        expect(violations).toMatchObject([
          {
            code: "MAX_GUEST_TOTAL_ITEMS_EXCEEDED",
            parameters: {
              excessQuantity: quantityOverGuestLimit - maximumGuestItems,
              maxQuantity: maximumGuestItems,
            },
            targets: [{ type: "cartItem", lineItemId: "line-1" }],
          },
        ]);
      }).pipe(Effect.provide(CartPolicies.layer))
  );

  it.effect("evaluates every policy and combines violations", () =>
    Effect.gen(function* () {
      const policies = yield* CartPolicies;
      const violations = yield* policies.evaluate(cart);

      expect(violations.map((violation) => violation.code)).toEqual([
        "cart.first",
        "cart.second",
      ]);
    }).pipe(
      Effect.provide(
        CartPolicies.layerFrom([
          {
            name: "first",
            evaluate: () =>
              Effect.succeed([
                { code: "cart.first", targets: [{ type: "cart" as const }] },
              ]),
          },
          {
            name: "second",
            evaluate: () =>
              Effect.succeed([
                { code: "cart.second", targets: [{ type: "cart" as const }] },
              ]),
          },
        ])
      )
    )
  );

  it.effect("keeps policy execution failure distinct from violations", () =>
    Effect.gen(function* () {
      const policies = yield* CartPolicies;
      const error = yield* policies.evaluate(cart).pipe(Effect.flip);

      expect(error._tag).toBe("CartPolicyFailure");
    }).pipe(
      Effect.provide(
        CartPolicies.layerFrom([
          {
            name: "broken",
            evaluate: () => Effect.fail(new CartPolicyFailure({})),
          },
        ])
      )
    )
  );
});
