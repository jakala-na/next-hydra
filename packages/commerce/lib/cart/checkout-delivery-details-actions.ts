import type {
  CheckoutDeliveryDetails,
  ShippingAddress,
} from "../../domain/checkout";
import type { Cart } from "../types";

type SaveCheckoutDeliveryDetailsAction = {
  readonly setShippingAddress: {
    readonly address: {
      readonly streetName: string;
      readonly postalCode: string;
      readonly city: string;
      readonly country: string;
      readonly additionalStreetInfo?: string;
      readonly region?: string;
    };
  };
};

const shippingAddressesEqual = (
  left: ShippingAddress | null | undefined,
  right: ShippingAddress
) =>
  left?.addressLine1 === right.addressLine1 &&
  left.postalCode === right.postalCode &&
  left.city === right.city &&
  left.country === right.country &&
  left.addressLine2 === right.addressLine2 &&
  left.region === right.region;

export const hasPersistedCheckoutDeliveryDetails = (
  cart: Pick<Cart, "shippingAddress">,
  deliveryDetails: CheckoutDeliveryDetails
) =>
  shippingAddressesEqual(cart.shippingAddress, deliveryDetails.shippingAddress);

export const buildSaveCheckoutDeliveryDetailsActions = (
  deliveryDetails: CheckoutDeliveryDetails
): SaveCheckoutDeliveryDetailsAction[] => [
  {
    setShippingAddress: {
      address: {
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
