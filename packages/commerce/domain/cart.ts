import { Schema } from "effect";

import { Money } from "./money";

export const CartId = Schema.NonEmptyString.pipe(Schema.brand("CartId"));
export type CartId = typeof CartId.Type;

export const LineItemId = Schema.NonEmptyString.pipe(
  Schema.brand("LineItemId")
);
export type LineItemId = typeof LineItemId.Type;

export { ProductId, Sku, VariantId } from "../product/identity";

export const PositiveCartQuantity = Schema.Int.check(Schema.isGreaterThan(0));
export type PositiveCartQuantity = typeof PositiveCartQuantity.Type;

export const CartQuantity = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
export type CartQuantity = typeof CartQuantity.Type;

export const CartMoney = Money;
export type CartMoney = Money;
