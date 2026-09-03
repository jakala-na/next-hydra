import {
  DeliveryGroupReference,
  DeliveryPlanQuoteReference,
  DeliveryPlanReference,
} from "@repo/commerce/domain/delivery-plan";
import { describe, expect, it } from "vitest";

import {
  deliveryReferencesFromShippingKey,
  shippingKeyFor,
} from "./references";

describe("Delivery Plan native shipping references", () => {
  it("round-trips both the Delivery Group and authoritative quote", () => {
    const reference = DeliveryGroupReference.make("delivery-1");
    const quoteReference = DeliveryPlanQuoteReference.make("quote-1");
    const planReference = DeliveryPlanReference.make("plan-1");

    expect(
      deliveryReferencesFromShippingKey(
        shippingKeyFor(reference, quoteReference, planReference)
      )
    ).toStrictEqual({ planReference, quoteReference, reference });
  });

  it("does not accept legacy or malformed keys without a quote identity", () => {
    expect(
      deliveryReferencesFromShippingKey("delivery-group-ZGVsaXZlcnktMQ")
    ).toBeUndefined();
    expect(
      deliveryReferencesFromShippingKey("external-shipping-key")
    ).toBeUndefined();
  });
});
