import { Schema } from "effect";
import { Address } from "./address";

const ADDRESS_BOOK_REFERENCE_MAX_LENGTH = 160;
const ADDRESS_BOOK_REFERENCE_PATTERN = /^[A-Za-z0-9_-]+$/;

export const AddressBookReference = Schema.NonEmptyString.check(
  Schema.isMaxLength(ADDRESS_BOOK_REFERENCE_MAX_LENGTH),
  Schema.isPattern(ADDRESS_BOOK_REFERENCE_PATTERN)
).pipe(Schema.brand("AddressBookReference"));
export type AddressBookReference = typeof AddressBookReference.Type;

export const AddressType = Schema.Literals(["shipping", "billing"]);
export type AddressType = typeof AddressType.Type;

const ADDRESS_TYPE_ORDER = AddressType.literals;

export function normalizeAddressTypes(
  types: readonly [AddressType, ...AddressType[]],
  defaults: {
    readonly defaultShipping: boolean;
    readonly defaultBilling: boolean;
  }
): readonly [AddressType, ...AddressType[]];
export function normalizeAddressTypes(
  types: readonly AddressType[],
  defaults: {
    readonly defaultShipping: boolean;
    readonly defaultBilling: boolean;
  }
): readonly AddressType[];
export function normalizeAddressTypes(
  types: readonly AddressType[],
  defaults: {
    readonly defaultShipping: boolean;
    readonly defaultBilling: boolean;
  }
): readonly AddressType[] {
  const normalized = new Set(types);
  if (defaults.defaultShipping) {
    normalized.add("shipping");
  }
  if (defaults.defaultBilling) {
    normalized.add("billing");
  }
  return ADDRESS_TYPE_ORDER.filter((type) => normalized.has(type));
}

const addressBookEntryFields = {
  reference: AddressBookReference,
  address: Address,
  types: Schema.NonEmptyArray(AddressType).check(Schema.isUnique()),
  defaultShipping: Schema.Boolean,
  defaultBilling: Schema.Boolean,
};

const addressBookEntrySchema = Schema.Struct(addressBookEntryFields).check(
  Schema.makeFilter<{
    readonly types: readonly AddressType[];
    readonly defaultShipping: boolean;
    readonly defaultBilling: boolean;
  }>((entry) => {
    const issues: Schema.FilterIssue[] = [];
    if (entry.defaultShipping && !entry.types.includes("shipping")) {
      issues.push({
        path: ["types"],
        issue: "Default Shipping requires the Shipping Address Type",
      });
    }
    if (entry.defaultBilling && !entry.types.includes("billing")) {
      issues.push({
        path: ["types"],
        issue: "Default Billing requires the Billing Address Type",
      });
    }
    return issues;
  })
);

export class AddressBookEntry extends Schema.Class<AddressBookEntry>(
  "AddressBookEntry"
)(addressBookEntrySchema) {}

export class SaveAddressBookEntryInput extends Schema.Class<SaveAddressBookEntryInput>(
  "SaveAddressBookEntryInput"
)(addressBookEntryFields) {}

export const AddressBookOperation = Schema.Literals(["list", "get", "save"]);
export type AddressBookOperation = typeof AddressBookOperation.Type;

export class AddressBookAccessDenied extends Schema.TaggedErrorClass<AddressBookAccessDenied>()(
  "AddressBookAccessDenied",
  {
    message: Schema.String,
    operation: AddressBookOperation,
  }
) {}

export class AddressBookEntryNotFound extends Schema.TaggedErrorClass<AddressBookEntryNotFound>()(
  "AddressBookEntryNotFound",
  {
    message: Schema.String,
    reference: AddressBookReference,
  }
) {}

export class AddressBookProviderFailure extends Schema.TaggedErrorClass<AddressBookProviderFailure>()(
  "AddressBookProviderFailure",
  {
    message: Schema.String,
    operation: AddressBookOperation,
    cause: Schema.optional(Schema.Defect),
  }
) {}

export type AddressBookReadError =
  | AddressBookAccessDenied
  | AddressBookProviderFailure;

export type AddressBookGetError =
  | AddressBookEntryNotFound
  | AddressBookReadError;
