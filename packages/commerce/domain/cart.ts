import { Schema } from "effect";
import { CommerceBusinessUnitId, CommerceCustomerId } from "./commerce-account";

export const CartId = Schema.NonEmptyString.pipe(Schema.brand("CartId"));
export type CartId = typeof CartId.Type;

export const AnonymousId = Schema.NonEmptyString.pipe(
  Schema.brand("AnonymousId")
);
export type AnonymousId = typeof AnonymousId.Type;

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

export const CartForCheckoutLineItem = Schema.Struct({
  id: LineItemId,
  productId: ProductId,
  name: Schema.optional(Schema.String),
  quantity: Schema.Number,
  totalPrice: Schema.NullOr(CartMoney),
  variant: Schema.optional(
    Schema.Struct({
      id: VariantId,
      sku: Schema.optional(Sku),
    })
  ),
});
export type CartForCheckoutLineItem = typeof CartForCheckoutLineItem.Type;

export const CartForCheckout = Schema.Struct({
  id: CartId,
  version: Schema.Number,
  customerId: Schema.optional(CommerceCustomerId),
  businessUnitId: Schema.optional(CommerceBusinessUnitId),
  anonymousId: Schema.optional(AnonymousId),
  storeKey: Schema.optional(StoreKey),
  lineItems: Schema.Array(CartForCheckoutLineItem),
  totalLineItemQuantity: Schema.Number,
  totalPrice: CartMoney,
});
export type CartForCheckout = typeof CartForCheckout.Type;
