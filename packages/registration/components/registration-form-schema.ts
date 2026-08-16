import { makeActionResultSchema } from "@repo/actions";
import { ISO_COUNTRY_CODES } from "@repo/i18n/countries";
import { Schema } from "effect";

import { RegistrationId } from "../domain/identity";
import { RegistrationIntakeValidationError } from "../domain/registration-intake-validation";

export const REGION_REQUIRED_COUNTRY_CODES = ["US", "CA"] as const;

export const REGISTRATION_FIELD_LIMITS = {
  companyName: 120,
  companyPhone: 32,
  vatId: 64,
  contactName: 80,
  approvalReason: 500,
  actorName: 120,
  listLimit: 100,
} as const;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const COUNTRY_CODES = ISO_COUNTRY_CODES;

export const RegistrationFormMessageKey = Schema.Literals([
  "validation.companyName",
  "validation.companyNameMax",
  "validation.companyPhone",
  "validation.vatId",
  "validation.firstName",
  "validation.firstNameMax",
  "validation.lastName",
  "validation.lastNameMax",
  "validation.email",
  "validation.invalidVatId",
  "validation.streetAddress",
  "validation.postalCode",
  "validation.city",
  "validation.region",
  "validation.country",
  "validation.duplicateEmail",
  "errors.invalidSubmission",
  "errors.submitFailed",
  "errors.unsupportedRegistrationCountry",
]);
export type RegistrationFormMessageKey = typeof RegistrationFormMessageKey.Type;

export type RegistrationFormTranslator = (
  key: RegistrationFormMessageKey
) => string;

export const requiresRegion = (country: string) =>
  REGION_REQUIRED_COUNTRY_CODES.includes(
    country.toUpperCase() as (typeof REGION_REQUIRED_COUNTRY_CODES)[number]
  );

export const getCountryOptions = (locale: string) => {
  const countryDisplayNames = new Intl.DisplayNames([locale], {
    type: "region",
  });

  return COUNTRY_CODES.map((value) => ({
    value,
    label: countryDisplayNames.of(value) ?? value,
  })).sort((left, right) => left.label.localeCompare(right.label));
};

const stringWithLength = ({
  max,
  maxMessage,
}: {
  readonly max: number;
  readonly maxMessage: string;
}) =>
  Schema.Trim.pipe(
    Schema.check(Schema.isMaxLength(max, { message: maxMessage }))
  );

const requiredString = ({
  requiredMessage,
  max,
  maxMessage,
}: {
  readonly requiredMessage: string;
  readonly max: number;
  readonly maxMessage: string;
}) =>
  Schema.Trim.pipe(
    Schema.check(
      Schema.isMinLength(1, {
        message: requiredMessage,
      }),
      Schema.isMaxLength(max, {
        message: maxMessage,
      })
    )
  );

export const makeRegistrationFormInputSchema = (
  t: RegistrationFormTranslator
) => {
  const addressSchema = Schema.Struct({
    streetName: requiredString({
      requiredMessage: t("validation.streetAddress"),
      max: REGISTRATION_FIELD_LIMITS.companyName,
      maxMessage: t("validation.streetAddress"),
    }),
    additionalStreetInfo: stringWithLength({
      max: REGISTRATION_FIELD_LIMITS.companyName,
      maxMessage: t("validation.streetAddress"),
    }),
    postalCode: requiredString({
      requiredMessage: t("validation.postalCode"),
      max: REGISTRATION_FIELD_LIMITS.companyPhone,
      maxMessage: t("validation.postalCode"),
    }),
    city: requiredString({
      requiredMessage: t("validation.city"),
      max: REGISTRATION_FIELD_LIMITS.contactName,
      maxMessage: t("validation.city"),
    }),
    region: Schema.Trim,
    country: Schema.Literals(COUNTRY_CODES),
  });

  return Schema.Struct({
    companyName: requiredString({
      requiredMessage: t("validation.companyName"),
      max: REGISTRATION_FIELD_LIMITS.companyName,
      maxMessage: t("validation.companyNameMax"),
    }),
    companyPhone: stringWithLength({
      max: REGISTRATION_FIELD_LIMITS.companyPhone,
      maxMessage: t("validation.companyPhone"),
    }),
    vatId: stringWithLength({
      max: REGISTRATION_FIELD_LIMITS.vatId,
      maxMessage: t("validation.vatId"),
    }),
    contactFirstName: requiredString({
      requiredMessage: t("validation.firstName"),
      max: REGISTRATION_FIELD_LIMITS.contactName,
      maxMessage: t("validation.firstNameMax"),
    }),
    contactLastName: requiredString({
      requiredMessage: t("validation.lastName"),
      max: REGISTRATION_FIELD_LIMITS.contactName,
      maxMessage: t("validation.lastNameMax"),
    }),
    email: Schema.Trim.pipe(
      Schema.check(
        Schema.isPattern(EMAIL_PATTERN, {
          message: t("validation.email"),
        })
      )
    ),
    address: addressSchema,
  }).pipe(
    Schema.check(
      Schema.makeFilter((input) =>
        requiresRegion(input.address.country) && !input.address.region
          ? {
              path: ["address", "region"],
              issue: t("validation.region"),
            }
          : undefined
      )
    )
  );
};

const defaultMessage = (key: RegistrationFormMessageKey) => key;

export const RegistrationFormInputSchema =
  makeRegistrationFormInputSchema(defaultMessage);

export type RegistrationFormInput = typeof RegistrationFormInputSchema.Type;
export type RegistrationFormValues = typeof RegistrationFormInputSchema.Encoded;

export const REGISTRATION_FORM_FIELD_PATHS = [
  "companyName",
  "companyPhone",
  "vatId",
  "contactFirstName",
  "contactLastName",
  "email",
  "address.streetName",
  "address.additionalStreetInfo",
  "address.postalCode",
  "address.city",
  "address.region",
  "address.country",
] as const;

export const RegistrationFormIssuePath = Schema.Literals([
  ...REGISTRATION_FORM_FIELD_PATHS,
  "root",
]);
export type RegistrationFormIssuePath = typeof RegistrationFormIssuePath.Type;

export class RegistrationFormIssue extends Schema.Class<RegistrationFormIssue>(
  "RegistrationFormIssue"
)({
  path: RegistrationFormIssuePath,
  message: Schema.String,
}) {}

export const RegistrationFormSuccess = Schema.Struct({
  registrationId: RegistrationId,
});
export type RegistrationFormSuccess = typeof RegistrationFormSuccess.Type;

export const RegistrationSubmissionUnavailable = Schema.TaggedStruct(
  "RegistrationSubmissionUnavailable",
  {}
);
export type RegistrationSubmissionUnavailable =
  typeof RegistrationSubmissionUnavailable.Type;

export const RegistrationFormError = Schema.Union([
  RegistrationIntakeValidationError,
  RegistrationSubmissionUnavailable,
]);
export type RegistrationFormError = typeof RegistrationFormError.Type;

export const RegistrationFormFailure = Schema.Struct({
  error: RegistrationFormError,
  issues: Schema.NonEmptyArray(RegistrationFormIssue),
});
export type RegistrationFormFailure = typeof RegistrationFormFailure.Type;

export const RegistrationFormResultSchema = makeActionResultSchema(
  RegistrationFormSuccess,
  RegistrationFormFailure
);
export type RegistrationFormResult =
  typeof RegistrationFormResultSchema.Encoded;
