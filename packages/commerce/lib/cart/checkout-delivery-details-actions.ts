import type { CheckoutDeliveryDetails } from "../../domain/checkout";
import { checkoutDeliveryDetailsEqual } from "../checkout/delivery-details-equality";
import { toCommercetoolsAddressKey } from "../infra/commercetools/address-book-key";
import type { Cart } from "../types";

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
  cart: Pick<Cart, "checkoutDetails" | "shippingAddress">,
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
        streetName: deliveryDetails.shippingAddress.addressLine1,
        postalCode: deliveryDetails.shippingAddress.postalCode,
        city: deliveryDetails.shippingAddress.city,
        country: deliveryDetails.shippingAddress.country,
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
