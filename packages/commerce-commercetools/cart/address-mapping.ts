import type { BaseAddress } from "@commercetools/platform-sdk";

interface CommercetoolsAddressInput {
  readonly addressLine1: string;
  readonly addressLine2?: string;
  readonly city: string;
  readonly country: string;
  readonly postalCode: string;
  readonly region?: string;
}

export const toCommercetoolsAddress = (
  address: CommercetoolsAddressInput,
  key?: string
): BaseAddress => {
  const base: BaseAddress = {
    city: address.city,
    country: address.country,
    postalCode: address.postalCode,
    streetName: address.addressLine1,
  };
  const withKey = key === undefined ? base : { ...base, key };
  const withAddressLine2 =
    address.addressLine2 === undefined
      ? withKey
      : { ...withKey, additionalStreetInfo: address.addressLine2 };
  return address.region === undefined
    ? withAddressLine2
    : { ...withAddressLine2, state: address.region };
};
