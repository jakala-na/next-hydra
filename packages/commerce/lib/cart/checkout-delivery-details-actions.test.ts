import { describe, expect, it } from "vitest";
import {
  type CheckoutDeliveryDetails,
  CountryCode,
} from "../../domain/checkout";
import {
  buildSaveCheckoutDeliveryDetailsActions,
  hasPersistedCheckoutDeliveryDetails,
} from "./checkout-delivery-details-actions";

const deliveryDetails = {
  source: "manual",
  shippingAddress: {
    addressLine1: "123 Analytical Engine Way",
    addressLine2: "Suite 42",
    postalCode: "SW1A 1AA",
    city: "London",
    country: CountryCode.make("GB"),
    region: "Greater London",
  },
} as const satisfies CheckoutDeliveryDetails;

describe("buildSaveCheckoutDeliveryDetailsActions", () => {
  it("replaces the Cart Shipping Address", () => {
    expect(buildSaveCheckoutDeliveryDetailsActions(deliveryDetails)).toEqual([
      {
        setShippingAddress: {
          address: {
            streetName: "123 Analytical Engine Way",
            additionalStreetInfo: "Suite 42",
            postalCode: "SW1A 1AA",
            city: "London",
            country: "GB",
            region: "Greater London",
          },
        },
      },
    ]);
  });
});

describe("hasPersistedCheckoutDeliveryDetails", () => {
  it("matches the complete persisted Shipping Address", () => {
    expect(
      hasPersistedCheckoutDeliveryDetails(
        { shippingAddress: deliveryDetails.shippingAddress },
        deliveryDetails
      )
    ).toBe(true);

    expect(
      hasPersistedCheckoutDeliveryDetails(
        {
          shippingAddress: {
            ...deliveryDetails.shippingAddress,
            city: "Oxford",
          },
        },
        deliveryDetails
      )
    ).toBe(false);
  });
});
