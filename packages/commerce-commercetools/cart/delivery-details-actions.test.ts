import { AddressBookReference } from "@repo/commerce/domain/address-book";
import { CountryCode } from "@repo/commerce/domain/checkout";
import type { CheckoutDeliveryDetails } from "@repo/commerce/domain/checkout";
import { describe, expect, it } from "vitest";

import {
  buildSaveCheckoutDeliveryDetailsActions,
  hasPersistedCheckoutDeliveryDetails,
} from "./delivery-details-actions";

const shippingAddress = {
  addressLine1: "123 Analytical Engine Way",
  addressLine2: "Suite 42",
  city: "London",
  country: CountryCode.make("GB"),
  postalCode: "SW1A 1AA",
  region: "Greater London",
};

const manualDeliveryDetails = {
  shippingAddress,
  source: "manual",
} as const satisfies CheckoutDeliveryDetails;

const addressBookDeliveryDetails = {
  addressBookReference: AddressBookReference.make("london-office"),
  shippingAddress,
  source: "addressBook",
} as const satisfies CheckoutDeliveryDetails;

describe(buildSaveCheckoutDeliveryDetailsActions, () => {
  it("copies a Manual address into the Cart without saved identity", () => {
    expect(
      buildSaveCheckoutDeliveryDetailsActions(manualDeliveryDetails)
    ).toStrictEqual([
      {
        setShippingAddress: {
          address: {
            additionalStreetInfo: "Suite 42",
            city: "London",
            country: "GB",
            postalCode: "SW1A 1AA",
            region: "Greater London",
            streetName: "123 Analytical Engine Way",
          },
        },
      },
    ]);
  });

  it("copies a saved address and its Address Book key into the Cart", () => {
    expect(
      buildSaveCheckoutDeliveryDetailsActions(addressBookDeliveryDetails)
    ).toStrictEqual([
      {
        setShippingAddress: {
          address: {
            additionalStreetInfo: "Suite 42",
            city: "London",
            country: "GB",
            key: "address-book-bG9uZG9uLW9mZmljZQ",
            postalCode: "SW1A 1AA",
            region: "Greater London",
            streetName: "123 Analytical Engine Way",
          },
        },
      },
    ]);
  });
});

describe(hasPersistedCheckoutDeliveryDetails, () => {
  it("requires matching address values and saved-address identity", () => {
    expect(
      hasPersistedCheckoutDeliveryDetails(
        {
          checkoutDetails: { deliveryDetails: addressBookDeliveryDetails },
          shippingAddress,
        },
        addressBookDeliveryDetails
      )
    ).toBeTruthy();

    expect(
      hasPersistedCheckoutDeliveryDetails(
        {
          checkoutDetails: { deliveryDetails: addressBookDeliveryDetails },
          shippingAddress: { ...shippingAddress, city: "Oxford" },
        },
        addressBookDeliveryDetails
      )
    ).toBeFalsy();

    expect(
      hasPersistedCheckoutDeliveryDetails(
        {
          checkoutDetails: { deliveryDetails: manualDeliveryDetails },
          shippingAddress,
        },
        addressBookDeliveryDetails
      )
    ).toBeFalsy();
  });
});
