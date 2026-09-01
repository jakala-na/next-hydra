interface ComparableShippingAddress {
  readonly addressLine1: string;
  readonly addressLine2?: string;
  readonly city: string;
  readonly country: string;
  readonly postalCode: string;
  readonly region?: string;
}

export const shippingAddressesEqual = (
  left: ComparableShippingAddress,
  right: ComparableShippingAddress
) =>
  left.addressLine1 === right.addressLine1 &&
  left.addressLine2 === right.addressLine2 &&
  left.city === right.city &&
  left.country === right.country &&
  left.postalCode === right.postalCode &&
  left.region === right.region;
