import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { CartId, StoreKey } from "../domain/cart";
import { CartPolicyFailure } from "../domain/cart-errors";
import type { CartSnapshot } from "../domain/cart-snapshot";
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

describe("CartPolicies", () => {
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
