import { CheckoutDeliveryDetails } from "@repo/commerce/domain/checkout";
import { checkoutDeliveryDetailsEqual } from "@repo/commerce/lib/checkout/delivery-details-equality";
import { Schema } from "effect";

import type { CommercetoolsCart } from "./provider-cart";

type SaveCheckoutDeliveryDetailsAction = {
  readonly setCustomField: {
    readonly name: string;
    readonly value: string;
  };
};

export const CHECKOUT_DELIVERY_DETAILS_CUSTOM_FIELD_NAME =
  "checkoutDeliveryDetails";

const CheckoutDeliveryDetailsFromJson = Schema.fromJsonString(
  CheckoutDeliveryDetails
);

export const serializeCheckoutDeliveryDetails = (
  deliveryDetails: CheckoutDeliveryDetails
) => Schema.encodeSync(CheckoutDeliveryDetailsFromJson)(deliveryDetails);

export const hasPersistedCheckoutDeliveryDetails = (
  cart: Pick<CommercetoolsCart, "checkoutDetails">,
  deliveryDetails: CheckoutDeliveryDetails
) => {
  const persistedDeliveryDetails = cart.checkoutDetails?.deliveryDetails;

  if (persistedDeliveryDetails === undefined) {
    return false;
  }

  return checkoutDeliveryDetailsEqual(
    persistedDeliveryDetails,
    deliveryDetails
  );
};

export const buildSaveCheckoutDeliveryDetailsActions = (
  deliveryDetails: CheckoutDeliveryDetails
): SaveCheckoutDeliveryDetailsAction[] => [
  {
    setCustomField: {
      name: CHECKOUT_DELIVERY_DETAILS_CUSTOM_FIELD_NAME,
      // GraphQL's Custom Field value is itself JSON. A Commercetools String
      // field therefore needs the serialized checkout JSON encoded as a JSON
      // string, just like checkoutContact.
      value: JSON.stringify(serializeCheckoutDeliveryDetails(deliveryDetails)),
    },
  },
];
