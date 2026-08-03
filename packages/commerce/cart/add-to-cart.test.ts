import { describe, expect, it } from "vitest";
import { addToCartInputSchema } from "./add-to-cart";

describe("addToCartInputSchema", () => {
  it("rejects non-positive quantities", () => {
    const result = addToCartInputSchema.safeParse({
      productId: "product-1",
      variantId: "variant-1",
      quantity: 0,
    });

    expect(result.success).toBe(false);
  });
});
