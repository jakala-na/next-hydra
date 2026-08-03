import { Schema } from "effect";
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

export const ProductTypeKey = Schema.Literals([
  "heavy-earthmoving-and-construction-equipment",
  "heavy-lifting-and-specialized-equipment",
  "generic-product",
]);
export type ProductTypeKey = typeof ProductTypeKey.Type;

export { ProductImage } from "../product/image";

export const ProductAttributeEnumValue = Schema.Struct({
  key: Schema.String,
  label: Schema.String,
});
export type ProductAttributeEnumValue = typeof ProductAttributeEnumValue.Type;

const ScalarProductAttributeValue = Schema.Union([
  Schema.String,
  Schema.Number,
  Schema.Boolean,
  ProductAttributeEnumValue,
]);

export const ProductAttributeValue = Schema.Union([
  ScalarProductAttributeValue,
  Schema.Array(ScalarProductAttributeValue),
]);
export type ProductAttributeValue = typeof ProductAttributeValue.Type;

export const ProductAttributes = Schema.Record(
  Schema.String,
  ProductAttributeValue
);
export type ProductAttributes = typeof ProductAttributes.Type;

export const CartProductVariant = Schema.Struct({
  id: VariantId,
  productId: ProductId,
  productType: Schema.optional(ProductTypeKey),
  name: Schema.optional(Schema.String),
  sku: Schema.optional(Sku),
  images: Schema.Array(ProductImageSchema),
  attributes: ProductAttributes,
});
export type CartProductVariant = typeof CartProductVariant.Type;

export const CartLineItem = Schema.Struct({
  id: LineItemId,
  variant: CartProductVariant,
  quantity: PositiveCartQuantity,
  unitPrice: CartMoney,
  totalPrice: Schema.optional(CartMoney),
});
export type CartLineItem = typeof CartLineItem.Type;

export const CartPolicyTarget = Schema.Union([
  Schema.Struct({ type: Schema.Literal("cart") }),
  Schema.Struct({
    type: Schema.Literal("cartItem"),
    lineItemId: Schema.optional(LineItemId),
    productId: ProductId,
    variantId: Schema.optional(VariantId),
    sku: Schema.optional(Sku),
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
  id: CartId,
  status: CartStatus,
  storeKey: StoreKey,
  buyingContext: Schema.optional(CartBuyingContext),
  lineItems: Schema.Array(CartLineItem),
  totalLineItemQuantity: CartQuantity,
  totalPrice: CartMoney,
  checkoutDetails: Schema.suspend(() => CheckoutDetails),
});
export type CartSnapshot = typeof CartSnapshot.Type;

export const CurrentCartState = Schema.Struct({
  cart: CartSnapshot,
  violations: Schema.Array(CartPolicyViolation),
});
export type CurrentCartState = typeof CurrentCartState.Type;

export const CartTarget = Schema.Union([
  Schema.Struct({
    _tag: Schema.Literal("AnonymousCartTarget"),
    id: CartId,
    store: Store,
  }),
  Schema.Struct({
    _tag: Schema.Literal("BusinessUnitCartTarget"),
    id: CartId,
    store: Store,
    customerId: CommerceCustomerId,
    businessUnitId: CommerceBusinessUnitId,
    businessUnitKey: CommerceBusinessUnitKey,
  }),
]);
export type CartTarget = typeof CartTarget.Type;
