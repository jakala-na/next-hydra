import type { Address } from "../../domain/address";

export const shippingAddressesEqual = (left: Address, right: Address) =>
  left.addressLine1 === right.addressLine1 &&
  left.addressLine2 === right.addressLine2 &&
  left.city === right.city &&
  left.country === right.country &&
  left.postalCode === right.postalCode &&
  left.region === right.region;
