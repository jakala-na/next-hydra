import { Effect } from "effect";
import type { Option } from "effect";
import { describe, expect, it } from "vitest";

import { CartPolicyFailure, CartProviderFailure } from "../domain/cart-errors";
import type { CurrentCartState } from "../domain/cart-snapshot";
import { projectCurrentCartProviderOutage } from "./current-cart-read-policy";
import { CART_UNAVAILABLE } from "./public-state";

const failedRead = (
  failure: CartProviderFailure | CartPolicyFailure
): Effect.Effect<
  Option.Option<CurrentCartState>,
  CartProviderFailure | CartPolicyFailure
> => Effect.fail(failure);

describe(projectCurrentCartProviderOutage, () => {
  it("turns only a provider outage into an explicit unavailable state", async () => {
    const result = await Effect.runPromise(
      projectCurrentCartProviderOutage(
        failedRead(
          new CartProviderFailure({
            operation: "findById",
            reason: "unavailable",
          })
        )
      )
    );

    expect(result).toBe(CART_UNAVAILABLE);
  });

  it.each(["invalidData", "unexpectedResponse"] as const)(
    "preserves a %s provider failure",
    async (reason) => {
      const failure = new CartProviderFailure({
        operation: "findById",
        reason,
      });

      const result = await Effect.runPromise(
        Effect.flip(projectCurrentCartProviderOutage(failedRead(failure)))
      );

      expect(result).toBe(failure);
    }
  );

  it("preserves a Cart policy failure", async () => {
    const failure = new CartPolicyFailure({});

    const result = await Effect.runPromise(
      Effect.flip(projectCurrentCartProviderOutage(failedRead(failure)))
    );

    expect(result).toBe(failure);
  });

  it("does not recover from defects", async () => {
    const defect = new Error("malformed provider Cart");
    const read: Effect.Effect<
      Option.Option<CurrentCartState>,
      CartProviderFailure
    > = Effect.die(defect);

    await expect(
      Effect.runPromise(projectCurrentCartProviderOutage(read))
    ).rejects.toThrow("malformed provider Cart");
  });
});
