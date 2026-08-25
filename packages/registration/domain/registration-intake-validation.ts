import { Schema } from "effect";

import { CountryCode } from "./identity";

export const RegistrationIntakeFieldPath = Schema.Literals(["email", "vatId"]);
export type RegistrationIntakeFieldPath =
  typeof RegistrationIntakeFieldPath.Type;

export class DuplicateRegistrationEmail extends Schema.TaggedClass<DuplicateRegistrationEmail>()(
  "DuplicateRegistrationEmail",
  {
    code: Schema.Literal("duplicateEmail"),
    path: Schema.Literal("email"),
  }
) {}

export class InvalidRegistrationVatId extends Schema.TaggedClass<InvalidRegistrationVatId>()(
  "InvalidRegistrationVatId",
  {
    code: Schema.Literal("invalidVatId"),
    path: Schema.Literal("vatId"),
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

export class RegistrationIntakeValidationError extends Schema.TaggedError<RegistrationIntakeValidationError>()(
  "RegistrationIntakeValidationError",
  {
    message: Schema.String,
    reasons: Schema.NonEmptyArray(RegistrationIntakeValidationReason),
  }
) {}
