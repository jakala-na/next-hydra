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
  attributes: ProductAttributes,
  id: VariantId,
  images: Schema.Array(ProductImageSchema),
  name: Schema.optional(Schema.String),
  productId: ProductId,
  productType: Schema.optional(ProductTypeKey),
  sku: Schema.optional(Sku),
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
