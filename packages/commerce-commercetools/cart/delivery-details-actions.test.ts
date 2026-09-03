import { AddressBookReference } from "@repo/commerce/domain/address-book";
import type { CheckoutDeliveryDetails } from "@repo/commerce/domain/checkout";
import { CountryCode } from "@repo/commerce/domain/checkout";
import { Effect } from "effect";
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
  it("persists Manual Delivery Details as cart-owned checkout data", () => {
    expect(
      Effect.runSync(
        buildSaveCheckoutDeliveryDetailsActions(
          {
            custom: {
              customFieldsRaw: [],
              type: { key: "orderCustomFields" },
            },
          },
          manualDeliveryDetails
        )
      )
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
      Effect.runSync(
        buildSaveCheckoutDeliveryDetailsActions(
          {
            custom: {
              customFieldsRaw: [],
              type: { key: "orderCustomFields" },
            },
          },
          addressBookDeliveryDetails
        )
      )
    ).toStrictEqual([
      {
        setCustomField: {
          name: "checkoutDeliveryDetails",
          value: JSON.stringify(JSON.stringify(addressBookDeliveryDetails)),
        },
      },
    ]);
  });

  it("assigns the Order Custom Type without a destructive preflight action", () => {
    expect(
      Effect.runSync(
        buildSaveCheckoutDeliveryDetailsActions(
          { custom: null },
          manualDeliveryDetails
        )
      )
    ).toStrictEqual([
      {
        setCustomType: {
          fields: [
            {
              name: "checkoutDeliveryDetails",
              value: JSON.stringify(JSON.stringify(manualDeliveryDetails)),
            },
          ],
          typeKey: "orderCustomFields",
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
