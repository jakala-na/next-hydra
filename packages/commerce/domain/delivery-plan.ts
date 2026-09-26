import { Schema } from "effect";

import { Address } from "./address";
import { LineItemId, PositiveCartQuantity } from "./cart";
import { Money } from "./money";

export const DeliveryPlanReference = Schema.NonEmptyString.pipe(
  Schema.brand("DeliveryPlanReference")
);
export type DeliveryPlanReference = typeof DeliveryPlanReference.Type;

export const DeliveryGroupReference = Schema.NonEmptyString.pipe(
  Schema.brand("DeliveryGroupReference")
);
export type DeliveryGroupReference = typeof DeliveryGroupReference.Type;

export const ShippingOptionReference = Schema.NonEmptyString.pipe(
  Schema.brand("ShippingOptionReference")
);
export type ShippingOptionReference = typeof ShippingOptionReference.Type;

export const DeliveryPlanQuoteReference = Schema.NonEmptyString.pipe(
  Schema.brand("DeliveryPlanQuoteReference")
);
export type DeliveryPlanQuoteReference = typeof DeliveryPlanQuoteReference.Type;

export const DeliveryTarget = Schema.Struct({
  lineItemId: LineItemId,
  quantity: PositiveCartQuantity,
});
export type DeliveryTarget = typeof DeliveryTarget.Type;

export const DeliveryPromise = Schema.Struct({
  label: Schema.NonEmptyString,
});
export type DeliveryPromise = typeof DeliveryPromise.Type;

export const ShippingOption = Schema.Struct({
  deliveryPromise: Schema.optional(DeliveryPromise),
  description: Schema.optional(Schema.NonEmptyString),
  name: Schema.NonEmptyString,
  price: Money,
  reference: ShippingOptionReference,
});
export type ShippingOption = typeof ShippingOption.Type;

export const DeliveryGroup = Schema.Struct({
  reference: DeliveryGroupReference,
  shippingAddress: Address,
  shippingOptions: Schema.Array(ShippingOption),
  targets: Schema.NonEmptyArray(DeliveryTarget),
});
export type DeliveryGroup = typeof DeliveryGroup.Type;

export const DeliveryPlan = Schema.Struct({
  groups: Schema.NonEmptyArray(DeliveryGroup),
  reference: DeliveryPlanReference,
});
export type DeliveryPlan = typeof DeliveryPlan.Type;

export const DeliveryPlanQuote = Schema.Struct({
  plans: Schema.Array(DeliveryPlan),
  reference: DeliveryPlanQuoteReference,
});
export type DeliveryPlanQuote = typeof DeliveryPlanQuote.Type;

export const SelectedDeliveryGroup = Schema.Struct({
  reference: DeliveryGroupReference,
  selectedShippingOption: ShippingOption,
  shippingAddress: Address,
  targets: Schema.NonEmptyArray(DeliveryTarget),
});
export type SelectedDeliveryGroup = typeof SelectedDeliveryGroup.Type;

export const SelectedDeliveryPlan = Schema.Struct({
  groups: Schema.NonEmptyArray(SelectedDeliveryGroup),
  quoteReference: DeliveryPlanQuoteReference,
  reference: DeliveryPlanReference,
});
export type SelectedDeliveryPlan = typeof SelectedDeliveryPlan.Type;

export const DeliveryPlanSelection = Schema.Struct({
  groups: Schema.NonEmptyArray(
    Schema.Struct({
      deliveryGroupReference: DeliveryGroupReference,
      shippingOptionReference: ShippingOptionReference,
    })
  ),
  quoteReference: DeliveryPlanQuoteReference,
  reference: DeliveryPlanReference,
});
export type DeliveryPlanSelection = typeof DeliveryPlanSelection.Type;
