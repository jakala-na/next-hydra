import type { CartId } from "@repo/commerce/domain/cart";
import {
  DeliveryGroupReference,
  DeliveryPlanQuoteReference,
  DeliveryPlanReference,
  ShippingOptionReference,
} from "@repo/commerce/domain/delivery-plan";
import type {
  DeliveryGroupReference as DeliveryGroupReferenceValue,
  DeliveryPlanQuoteReference as DeliveryPlanQuoteReferenceValue,
  DeliveryPlanReference as DeliveryPlanReferenceValue,
  ShippingOptionReference as ShippingOptionReferenceValue,
} from "@repo/commerce/domain/delivery-plan";
import { Option, Schema } from "effect";

const PLAN_PREFIX = "delivery-plan-";
const OPTION_PREFIX = "shipping-option-";
const SHIPPING_KEY_PREFIX = "delivery-group-";
const ADDRESS_KEY_PREFIX = "delivery-address-";

const encode = (value: string) =>
  Buffer.from(value, "utf-8").toString("base64url");

const decode = (value: string) =>
  Buffer.from(value, "base64url").toString("utf-8");

export const LINEAR_DELIVERY_GROUP_REFERENCE =
  DeliveryGroupReference.make("delivery-1");

export const deliveryPlanReferenceFor = (cartId: CartId) =>
  DeliveryPlanReference.make(`${PLAN_PREFIX}${encode(cartId)}`);

export const shippingOptionReferenceFor = (shippingMethodId: string) =>
  ShippingOptionReference.make(`${OPTION_PREFIX}${encode(shippingMethodId)}`);

export const deliveryPlanQuoteReferenceFor = (fingerprint: string) =>
  DeliveryPlanQuoteReference.make(`delivery-quote-${fingerprint}`);

export const shippingMethodIdFrom = (
  reference: ShippingOptionReferenceValue
): string | undefined => {
  const value = String(reference);
  if (!value.startsWith(OPTION_PREFIX)) {
    return;
  }

  const decoded = decode(value.slice(OPTION_PREFIX.length));
  return shippingOptionReferenceFor(decoded) === reference
    ? decoded
    : undefined;
};

export const shippingKeyFor = (
  reference: DeliveryGroupReferenceValue,
  quoteReference: DeliveryPlanQuoteReferenceValue,
  planReference: DeliveryPlanReferenceValue
) =>
  `${SHIPPING_KEY_PREFIX}${encode(reference)}.${encode(quoteReference)}.${encode(planReference)}`;

const deliveryGroupReferenceFrom = (value: string, prefix: string) => {
  if (!value.startsWith(prefix)) {
    return;
  }

  return Option.getOrUndefined(
    Schema.decodeOption(DeliveryGroupReference)(
      decode(value.slice(prefix.length))
    )
  );
};

export const deliveryReferencesFromShippingKey = (value: string) => {
  if (!value.startsWith(SHIPPING_KEY_PREFIX)) {
    return;
  }
  const [encodedGroup, encodedQuote, encodedPlan, ...remaining] = value
    .slice(SHIPPING_KEY_PREFIX.length)
    .split(".");
  if (
    encodedGroup === undefined ||
    encodedQuote === undefined ||
    encodedPlan === undefined ||
    remaining.length > 0
  ) {
    return;
  }
  const reference = Option.getOrUndefined(
    Schema.decodeOption(DeliveryGroupReference)(decode(encodedGroup))
  );
  const quoteReference = Option.getOrUndefined(
    Schema.decodeOption(DeliveryPlanQuoteReference)(decode(encodedQuote))
  );
  const planReference = Option.getOrUndefined(
    Schema.decodeOption(DeliveryPlanReference)(decode(encodedPlan))
  );
  if (
    reference === undefined ||
    quoteReference === undefined ||
    planReference === undefined ||
    shippingKeyFor(reference, quoteReference, planReference) !== value
  ) {
    return;
  }
  return { planReference, quoteReference, reference };
};

export const deliveryAddressKeyFor = (reference: DeliveryGroupReferenceValue) =>
  `${ADDRESS_KEY_PREFIX}${encode(reference)}`;

export const isDeliveryAddressKey = (value: string) => {
  const reference = deliveryGroupReferenceFrom(value, ADDRESS_KEY_PREFIX);
  return reference !== undefined && deliveryAddressKeyFor(reference) === value;
};
