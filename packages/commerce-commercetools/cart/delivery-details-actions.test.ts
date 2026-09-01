import { AddressBookReference } from "@repo/commerce/domain/address-book";
import {
  CheckoutDeliveryDetails,
  CountryCode,
} from "@repo/commerce/domain/checkout";
import { Schema } from "effect";
import { describe, expect, it } from "vitest";

import {
  buildSaveCheckoutDeliveryDetailsActions,
  hasPersistedCheckoutDeliveryDetails,
  serializeCheckoutDeliveryDetails,
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
  it("separates the persisted String value from GraphQL JSON encoding", () => {
    const serialized = serializeCheckoutDeliveryDetails(manualDeliveryDetails);

    expect(serialized).toBe(JSON.stringify(manualDeliveryDetails));
    expect(
      Schema.decodeSync(Schema.fromJsonString(CheckoutDeliveryDetails))(
        serialized
      )
    ).toStrictEqual(manualDeliveryDetails);
  });

  it("persists Manual Delivery Details as cart-owned checkout data", () => {
    expect(
      buildSaveCheckoutDeliveryDetailsActions(manualDeliveryDetails)
    ).toStrictEqual([
      {
        setCustomField: {
          name: "checkoutDeliveryDetails",
          value: JSON.stringify(JSON.stringify(manualDeliveryDetails)),
        },
      },
    ]);
  });

  it("persists saved-address identity with its Delivery Details", () => {
    expect(
      buildSaveCheckoutDeliveryDetailsActions(addressBookDeliveryDetails)
    ).toStrictEqual([
      {
        setCustomField: {
          name: "checkoutDeliveryDetails",
          value: JSON.stringify(JSON.stringify(addressBookDeliveryDetails)),
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
        },
        addressBookDeliveryDetails
      )
    ).toBeTruthy();

    expect(
      hasPersistedCheckoutDeliveryDetails(
        {
          checkoutDetails: { deliveryDetails: addressBookDeliveryDetails },
        },
        {
          ...addressBookDeliveryDetails,
          shippingAddress: { ...shippingAddress, city: "Oxford" },
        }
      )
    ).toBeFalsy();

    expect(
      hasPersistedCheckoutDeliveryDetails(
        {
          checkoutDetails: { deliveryDetails: manualDeliveryDetails },
        },
        addressBookDeliveryDetails
      )
    ).toBeFalsy();
  });
});
