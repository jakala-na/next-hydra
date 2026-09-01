import type { CheckoutDeliveryDetails } from "../../domain/checkout";
import { shippingAddressesEqual } from "./address-equality";

export const checkoutDeliveryDetailsEqual = (
  left: CheckoutDeliveryDetails | undefined,
  right: CheckoutDeliveryDetails
) =>
  left?.source === right.source &&
  (left.source !== "addressBook" ||
    (right.source === "addressBook" &&
      left.addressBookReference === right.addressBookReference)) &&
  shippingAddressesEqual(left.shippingAddress, right.shippingAddress);
