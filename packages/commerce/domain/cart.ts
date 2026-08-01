import { Schema } from "effect";

export const CartId = Schema.NonEmptyString.pipe(Schema.brand("CartId"));
export type CartId = typeof CartId.Type;

export const LineItemId = Schema.NonEmptyString.pipe(
  Schema.brand("LineItemId")
);
export type LineItemId = typeof LineItemId.Type;

export const ProductId = Schema.NonEmptyString.pipe(Schema.brand("ProductId"));
export type ProductId = typeof ProductId.Type;

export const StoreKey = Schema.NonEmptyString.pipe(Schema.brand("StoreKey"));
export type StoreKey = typeof StoreKey.Type;

export const Sku = Schema.NonEmptyString.pipe(Schema.brand("Sku"));
export type Sku = typeof Sku.Type;

export const VariantId = Schema.NonEmptyString.pipe(Schema.brand("VariantId"));
export type VariantId = typeof VariantId.Type;

export const PositiveCartQuantity = Schema.Int.check(Schema.isGreaterThan(0));
export type PositiveCartQuantity = typeof PositiveCartQuantity.Type;

export const CartQuantity = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
export type CartQuantity = typeof CartQuantity.Type;

export const CartMoney = Schema.Struct({
  centAmount: Schema.Int,
  currencyCode: Schema.String,
});
export type CartMoney = typeof CartMoney.Type;
