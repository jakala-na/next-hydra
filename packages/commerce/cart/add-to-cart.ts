import { Schema } from "effect";

import { PositiveCartQuantity, ProductId, VariantId } from "../domain/cart";
import type { AddToCartActionResult } from "./action-result";

export const AddToCartInputSchema = Schema.Struct({
  productId: ProductId,
  quantity: PositiveCartQuantity,
  variantId: VariantId,
});

export type AddToCartInput = typeof AddToCartInputSchema.Encoded;

export type AddToCartData = AddToCartActionResult;

export type AddToCartAction = (input: AddToCartInput) => Promise<AddToCartData>;
