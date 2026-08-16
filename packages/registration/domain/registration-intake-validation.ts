import { Schema } from "effect";

import { CountryCode } from "./identity";

export const RegistrationIntakeFieldPath = Schema.Literals(["email", "vatId"]);
export type RegistrationIntakeFieldPath =
  typeof RegistrationIntakeFieldPath.Type;

export class DuplicateRegistrationEmail extends Schema.TaggedClass<DuplicateRegistrationEmail>()(
  "DuplicateRegistrationEmail",
  {
    path: Schema.Literal("email"),
    code: Schema.Literal("duplicateEmail"),
  }
) {}

export class InvalidRegistrationVatId extends Schema.TaggedClass<InvalidRegistrationVatId>()(
  "InvalidRegistrationVatId",
  {
    path: Schema.Literal("vatId"),
    code: Schema.Literal("invalidVatId"),
  }
) {}

export class UnsupportedRegistrationCountry extends Schema.TaggedClass<UnsupportedRegistrationCountry>()(
  "UnsupportedRegistrationCountry",
  {
    code: Schema.Literal("unsupportedRegistrationCountry"),
    country: CountryCode,
  }
) {}

export const RegistrationIntakeValidationReason = Schema.Union([
  DuplicateRegistrationEmail,
  InvalidRegistrationVatId,
  UnsupportedRegistrationCountry,
]);
export type RegistrationIntakeValidationReason =
  typeof RegistrationIntakeValidationReason.Type;

export class RegistrationIntakeValidationError extends Schema.TaggedErrorClass<RegistrationIntakeValidationError>()(
  "RegistrationIntakeValidationError",
  {
    message: Schema.String,
    reasons: Schema.NonEmptyArray(RegistrationIntakeValidationReason),
  }
) {}
