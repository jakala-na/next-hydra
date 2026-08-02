import { CartId } from "@repo/commerce/domain/cart";
import { CartWriteOutcomeUnknown } from "@repo/commerce/domain/cart-errors";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { toCurrentCartMutationData } from "./current-cart-action-result";

describe("Current Cart storefront mutation results", () => {
  it("returns the Current Cart state from a successful mutation", async () => {
    const state = { cart: { id: "cart-1" }, violations: [] };
    const result = await Effect.runPromise(
      Effect.succeed(state).pipe(Effect.result)
    );

    expect(toCurrentCartMutationData(result)).toEqual({
      ok: true,
      data: state,
    });
  });

  it("shields an unknown add outcome from the client", async () => {
    const result = await Effect.runPromise(
      Effect.fail(
        new CartWriteOutcomeUnknown({
          operation: "addItem",
          cartId: CartId.make("cart-1"),
        })
      ).pipe(Effect.result)
    );

    const data = toCurrentCartMutationData(result);

    expect(data).toEqual({
      ok: false,
      error: {
        type: "DomainError",
        code: "UNKNOWN",
        message: "Current Cart mutation failed",
        details: undefined,
        cause: undefined,
      },
    });
    expect(JSON.stringify(data)).not.toContain("CartWriteOutcomeUnknown");
    expect(JSON.stringify(data)).not.toContain("cart-1");
  });
});
