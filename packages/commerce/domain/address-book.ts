import { Schema } from "effect";

import { Address } from "./address";
import { ProviderFailureReason } from "./provider-failure";

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
  address: Address,
  defaultBilling: Schema.Boolean,
  defaultShipping: Schema.Boolean,
  reference: AddressBookReference,
  types: Schema.NonEmptyArray(AddressType).check(Schema.isUnique()),
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
        issue: "Default Shipping requires the Shipping Address Type",
        path: ["types"],
      });
    }
    if (entry.defaultBilling && !entry.types.includes("billing")) {
      issues.push({
        issue: "Default Billing requires the Billing Address Type",
        path: ["types"],
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

export class AddressBookAccessDenied extends Schema.TaggedError<AddressBookAccessDenied>()(
  "AddressBookAccessDenied",
  {
    message: Schema.String,
    operation: AddressBookOperation,
  }
) {}

export class AddressBookEntryNotFound extends Schema.TaggedError<AddressBookEntryNotFound>()(
  "AddressBookEntryNotFound",
  {
    message: Schema.String,
    reference: AddressBookReference,
  }
) {}

export class AddressBookProviderFailure extends Schema.TaggedError<AddressBookProviderFailure>()(
  "AddressBookProviderFailure",
  {
    cause: Schema.optional(Schema.Defect()),
    message: Schema.String,
    operation: AddressBookOperation,
    reason: ProviderFailureReason,
  }
) {}

export class AddressBookWriteOutcomeUnknown extends Schema.TaggedError<AddressBookWriteOutcomeUnknown>()(
  "AddressBookWriteOutcomeUnknown",
  {
    cause: Schema.optional(Schema.Defect()),
    message: Schema.String,
    reference: AddressBookReference,
  }
) {}

export type AddressBookReadError =
  | AddressBookAccessDenied
  | AddressBookProviderFailure;

export type AddressBookGetError =
  | AddressBookEntryNotFound
  | AddressBookReadError;
