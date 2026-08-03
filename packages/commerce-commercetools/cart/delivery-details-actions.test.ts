import { AddressBookReference } from "@repo/commerce/domain/address-book";
import {
  type CheckoutDeliveryDetails,
  CountryCode,
} from "@repo/commerce/domain/checkout";
import { describe, expect, it } from "vitest";
import {
  buildSaveCheckoutDeliveryDetailsActions,
  hasPersistedCheckoutDeliveryDetails,
} from "./delivery-details-actions";

const shippingAddress = {
  addressLine1: "123 Analytical Engine Way",
  addressLine2: "Suite 42",
  postalCode: "SW1A 1AA",
  city: "London",
  country: CountryCode.make("GB"),
  region: "Greater London",
};

const manualDeliveryDetails = {
  source: "manual",
  shippingAddress,
} as const satisfies CheckoutDeliveryDetails;

const addressBookDeliveryDetails = {
  source: "addressBook",
  addressBookReference: AddressBookReference.make("london-office"),
  shippingAddress,
} as const satisfies CheckoutDeliveryDetails;

describe("buildSaveCheckoutDeliveryDetailsActions", () => {
  it("copies a Manual address into the Cart without saved identity", () => {
    expect(
      buildSaveCheckoutDeliveryDetailsActions(manualDeliveryDetails)
    ).toEqual([
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

  it("copies a saved address and its Address Book key into the Cart", () => {
    expect(
      buildSaveCheckoutDeliveryDetailsActions(addressBookDeliveryDetails)
    ).toEqual([
      {
        setShippingAddress: {
          address: {
            key: "address-book-bG9uZG9uLW9mZmljZQ",
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
  it("requires matching address values and saved-address identity", () => {
    expect(
      hasPersistedCheckoutDeliveryDetails(
        {
          shippingAddress,
          checkoutDetails: { deliveryDetails: addressBookDeliveryDetails },
        },
        addressBookDeliveryDetails
      )
    ).toBe(true);

    expect(
      hasPersistedCheckoutDeliveryDetails(
        {
          shippingAddress: { ...shippingAddress, city: "Oxford" },
          checkoutDetails: { deliveryDetails: addressBookDeliveryDetails },
        },
        addressBookDeliveryDetails
      )
    ).toBe(false);

    expect(
      hasPersistedCheckoutDeliveryDetails(
        {
          shippingAddress,
          checkoutDetails: { deliveryDetails: manualDeliveryDetails },
        },
        addressBookDeliveryDetails
      )
    ).toBe(false);
  });
});
