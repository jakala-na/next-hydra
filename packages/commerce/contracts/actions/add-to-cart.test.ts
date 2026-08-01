import { describe, expect, it } from "vitest";
import { addToCartInputSchema } from "./add-to-cart";

describe("addToCartInputSchema", () => {
  it("rejects fractional quantities before CurrentCart runs", () => {
    const result = addToCartInputSchema.safeParse({
      productId: "product-1",
      variantId: "variant-1",
      quantity: 1.5,
    });

    expect(result.success).toBe(false);
  });
});
