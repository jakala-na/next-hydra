import { makeActionResultSchema } from "@repo/actions";
import { ISO_COUNTRY_CODES } from "@repo/i18n/countries";
import { Schema } from "effect";

import { RegistrationId } from "../domain/identity";
import { RegistrationSubmissionPublicError } from "../public-errors";

export const REGION_REQUIRED_COUNTRY_CODES = ["US", "CA"] as const;

export const REGISTRATION_FIELD_LIMITS = {
  actorName: 120,
  approvalReason: 500,
  companyName: 120,
  companyPhone: 32,
  contactName: 80,
  listLimit: 100,
  vatId: 64,
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
  "errors.submissionOutcomeUnknown",
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
    label: countryDisplayNames.of(value) ?? value,
    value,
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
    additionalStreetInfo: stringWithLength({
      max: REGISTRATION_FIELD_LIMITS.companyName,
      maxMessage: t("validation.streetAddress"),
    }),
    city: requiredString({
      max: REGISTRATION_FIELD_LIMITS.contactName,
      maxMessage: t("validation.city"),
      requiredMessage: t("validation.city"),
    }),
    country: Schema.Literals(COUNTRY_CODES),
    postalCode: requiredString({
      max: REGISTRATION_FIELD_LIMITS.companyPhone,
      maxMessage: t("validation.postalCode"),
      requiredMessage: t("validation.postalCode"),
    }),
    region: Schema.Trim,
    streetName: requiredString({
      max: REGISTRATION_FIELD_LIMITS.companyName,
      maxMessage: t("validation.streetAddress"),
      requiredMessage: t("validation.streetAddress"),
    }),
  });

  return Schema.Struct({
    address: addressSchema,
    companyName: requiredString({
      max: REGISTRATION_FIELD_LIMITS.companyName,
      maxMessage: t("validation.companyNameMax"),
      requiredMessage: t("validation.companyName"),
    }),
    companyPhone: stringWithLength({
      max: REGISTRATION_FIELD_LIMITS.companyPhone,
      maxMessage: t("validation.companyPhone"),
    }),
    contactFirstName: requiredString({
      max: REGISTRATION_FIELD_LIMITS.contactName,
      maxMessage: t("validation.firstNameMax"),
      requiredMessage: t("validation.firstName"),
    }),
    contactLastName: requiredString({
      max: REGISTRATION_FIELD_LIMITS.contactName,
      maxMessage: t("validation.lastNameMax"),
      requiredMessage: t("validation.lastName"),
    }),
    email: Schema.Trim.pipe(
      Schema.check(
        Schema.isPattern(EMAIL_PATTERN, {
          message: t("validation.email"),
        })
      )
    ),
    vatId: stringWithLength({
      max: REGISTRATION_FIELD_LIMITS.vatId,
      maxMessage: t("validation.vatId"),
    }),
  }).pipe(
    Schema.check(
      Schema.makeFilter((input) =>
        requiresRegion(input.address.country) && !input.address.region
          ? {
              issue: t("validation.region"),
              path: ["address", "region"],
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

export const RegistrationFormSuccess = Schema.Struct({
  registrationId: RegistrationId,
});
export type RegistrationFormSuccess = typeof RegistrationFormSuccess.Type;

export const RegistrationFormResultSchema = makeActionResultSchema(
  RegistrationFormSuccess,
  RegistrationSubmissionPublicError
);
export type RegistrationFormResult =
  typeof RegistrationFormResultSchema.Encoded;
