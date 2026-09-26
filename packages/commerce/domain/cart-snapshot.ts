import { Schema } from "effect";

import { ProductTypeKey as GeneratedProductTypeKey } from "../product/generated/attributes";
import { ProductImage as ProductImageSchema } from "../product/image";
import { Store, StoreKey } from "../store";
import {
  CartId,
  CartMoney,
  CartQuantity,
  LineItemId,
  PositiveCartQuantity,
  ProductId,
  Sku,
  VariantId,
} from "./cart";
import { CheckoutDetails } from "./checkout";
import {
  CommerceBusinessUnitId,
  CommerceBusinessUnitKey,
  CommerceCustomerId,
} from "./commerce-account";

export const CartStatus = Schema.Literals(["active", "inactive"]);
export type CartStatus = typeof CartStatus.Type;

export const ProductTypeKey = GeneratedProductTypeKey;
export type ProductTypeKey = typeof ProductTypeKey.Type;

export { ProductImage } from "../product/image";

const CartLineItemSummaryAttributeText = Schema.String.check(
  Schema.makeFilter((value) => value.trim().length > 0, {
    expected: "a non-blank Cart Line Item Summary Attribute value",
  })
);

export const CartLineItemSummaryAttribute = Schema.Struct({
  label: CartLineItemSummaryAttributeText,
  value: CartLineItemSummaryAttributeText,
});
export type CartLineItemSummaryAttribute =
  typeof CartLineItemSummaryAttribute.Type;

export const CartProductVariant = Schema.Struct({
  id: VariantId,
  images: Schema.Array(ProductImageSchema),
  name: Schema.optional(Schema.String),
  productId: ProductId,
  productType: Schema.optional(ProductTypeKey),
  sku: Schema.optional(Sku),
  summaryAttribute: Schema.optional(CartLineItemSummaryAttribute),
});
export type CartProductVariant = typeof CartProductVariant.Type;

export const CartLineItem = Schema.Struct({
  id: LineItemId,
  quantity: PositiveCartQuantity,
  totalPrice: Schema.optional(CartMoney),
  unitPrice: CartMoney,
  variant: CartProductVariant,
});
export type CartLineItem = typeof CartLineItem.Type;
export type CartLineItemEncoded = typeof CartLineItem.Encoded;

export const CartPolicyTarget = Schema.Union([
  Schema.Struct({ type: Schema.Literal("cart") }),
  Schema.Struct({
    lineItemId: Schema.optional(LineItemId),
    productId: ProductId,
    sku: Schema.optional(Sku),
    type: Schema.Literal("cartItem"),
    variantId: Schema.optional(VariantId),
  }),
]);
export type CartPolicyTarget = typeof CartPolicyTarget.Type;

export const CartPolicyViolation = Schema.Struct({
  code: Schema.String,
  parameters: Schema.optional(
    Schema.Record(Schema.String, Schema.Union([Schema.String, Schema.Number]))
  ),
  targets: Schema.Array(CartPolicyTarget),
});
export type CartPolicyViolation = typeof CartPolicyViolation.Type;

export const CartBuyingContext = Schema.Struct({
  businessUnitId: CommerceBusinessUnitId,
});
export type CartBuyingContext = typeof CartBuyingContext.Type;

export const CartSnapshot = Schema.Struct({
  buyingContext: Schema.optional(CartBuyingContext),
  checkoutDetails: Schema.suspend(() => CheckoutDetails),
  id: CartId,
  lineItems: Schema.Array(CartLineItem),
  status: CartStatus,
  storeKey: StoreKey,
  totalLineItemQuantity: CartQuantity,
  totalPrice: CartMoney,
});
export type CartSnapshot = typeof CartSnapshot.Type;

export const CurrentCartState = Schema.Struct({
  cart: CartSnapshot,
  violations: Schema.Array(CartPolicyViolation),
});
export type CurrentCartState = typeof CurrentCartState.Type;
export type CurrentCartStateEncoded = typeof CurrentCartState.Encoded;

export const CartTarget = Schema.Union([
  Schema.Struct({
    _tag: Schema.Literal("AnonymousCartTarget"),
    id: CartId,
    store: Store,
  }),
  Schema.Struct({
    _tag: Schema.Literal("BusinessUnitCartTarget"),
    businessUnitId: CommerceBusinessUnitId,
    businessUnitKey: CommerceBusinessUnitKey,
    customerId: CommerceCustomerId,
    id: CartId,
    store: Store,
  }),
]);
export type CartTarget = typeof CartTarget.Type;
