import type { CheckoutDeliveryDetails } from "@repo/commerce/domain/checkout";
import { checkoutDeliveryDetailsEqual } from "@repo/commerce/lib/checkout/delivery-details-equality";

import { toCommercetoolsAddressKey } from "../address-book/address-book-key";
import type { CommercetoolsCart } from "./provider-cart";

type SaveCheckoutDeliveryDetailsAction = {
  readonly setShippingAddress: {
    readonly address: {
      readonly key?: string;
      readonly streetName: string;
      readonly postalCode: string;
      readonly city: string;
      readonly country: string;
      readonly additionalStreetInfo?: string;
      readonly region?: string;
    };
  };
};

export const hasPersistedCheckoutDeliveryDetails = (
  cart: Pick<CommercetoolsCart, "checkoutDetails" | "shippingAddress">,
  deliveryDetails: CheckoutDeliveryDetails
) => {
  const persistedDeliveryDetails = cart.checkoutDetails?.deliveryDetails;

  if (persistedDeliveryDetails === undefined || cart.shippingAddress == null) {
    return false;
  }

  return checkoutDeliveryDetailsEqual(
    {
      ...persistedDeliveryDetails,
      shippingAddress: cart.shippingAddress,
    },
    deliveryDetails
  );
};

export const buildSaveCheckoutDeliveryDetailsActions = (
  deliveryDetails: CheckoutDeliveryDetails
): SaveCheckoutDeliveryDetailsAction[] => [
  {
    setShippingAddress: {
      address: {
        ...(deliveryDetails.source === "addressBook"
          ? {
              key: toCommercetoolsAddressKey(
                deliveryDetails.addressBookReference
              ),
            }
          : {}),
        city: deliveryDetails.shippingAddress.city,
        country: deliveryDetails.shippingAddress.country,
        postalCode: deliveryDetails.shippingAddress.postalCode,
        streetName: deliveryDetails.shippingAddress.addressLine1,
        ...(deliveryDetails.shippingAddress.addressLine2 === undefined
          ? {}
          : {
              additionalStreetInfo:
                deliveryDetails.shippingAddress.addressLine2,
            }),
        ...(deliveryDetails.shippingAddress.region === undefined
          ? {}
          : { region: deliveryDetails.shippingAddress.region }),
      },
    },
  },
];
