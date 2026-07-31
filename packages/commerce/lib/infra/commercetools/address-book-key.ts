import { Option, Schema } from "effect";
import {
  AddressBookReference,
  type AddressBookReference as AddressBookReferenceValue,
} from "../../../domain/address-book";

const ADDRESS_KEY_PREFIX = "address-book-";

export const toCommercetoolsAddressKey = (
  reference: AddressBookReferenceValue
): string =>
  `${ADDRESS_KEY_PREFIX}${Buffer.from(String(reference), "utf8").toString(
    "base64url"
  )}`;

export const fromCommercetoolsAddressKey = (
  key: string
): AddressBookReferenceValue | undefined => {
  if (!key.startsWith(ADDRESS_KEY_PREFIX)) {
    return undefined;
  }

  const encoded = key.slice(ADDRESS_KEY_PREFIX.length);
  const decoded = Buffer.from(encoded, "base64url").toString("utf8");
  const reference = Option.getOrUndefined(
    Schema.decodeUnknownOption(AddressBookReference)(decoded)
  );

  return reference && toCommercetoolsAddressKey(reference) === key
    ? reference
    : undefined;
};
