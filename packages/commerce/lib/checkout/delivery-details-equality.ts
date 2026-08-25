import type { CheckoutDeliveryDetails } from "../../domain/checkout";

export const checkoutDeliveryDetailsEqual = (
  left: CheckoutDeliveryDetails | undefined,
  right: CheckoutDeliveryDetails
) =>
  left?.source === right.source &&
  (left.source !== "addressBook" ||
    (right.source === "addressBook" &&
      left.addressBookReference === right.addressBookReference)) &&
  left.shippingAddress.addressLine1 === right.shippingAddress.addressLine1 &&
  left.shippingAddress.postalCode === right.shippingAddress.postalCode &&
  left.shippingAddress.city === right.shippingAddress.city &&
  left.shippingAddress.country === right.shippingAddress.country &&
  left.shippingAddress.addressLine2 === right.shippingAddress.addressLine2 &&
  left.shippingAddress.region === right.shippingAddress.region;
