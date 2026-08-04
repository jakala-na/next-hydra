import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { AddToCartInputSchema } from "./add-to-cart";

describe("AddToCartInputSchema", () => {
  it("rejects non-positive quantities", () => {
    const result = Schema.decodeUnknownOption(AddToCartInputSchema)({
      productId: "product-1",
      quantity: 0,
      variantId: "variant-1",
    });

    expect(result._tag).toBe("None");
  });
});
