import type {
  FormActionFieldError,
  FormActionFormError,
  InvalidFormActionResult,
} from "@repo/form";
import { ISO_COUNTRY_CODES } from "@repo/i18n/countries";
import { Schema } from "effect";

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

export type RegistrationFormMessageKey =
  | "validation.companyName"
  | "validation.companyNameMax"
  | "validation.companyPhone"
  | "validation.vatId"
  | "validation.firstName"
  | "validation.firstNameMax"
  | "validation.lastName"
  | "validation.lastNameMax"
  | "validation.email"
  | "validation.invalidVatId"
  | "validation.streetAddress"
  | "validation.postalCode"
  | "validation.city"
  | "validation.region"
  | "validation.country"
  | "validation.duplicateEmail"
  | "errors.invalidSubmission"
  | "errors.submitFailed"
  | "errors.unsupportedRegistrationCountry";

type RegistrationFormTranslator = (key: RegistrationFormMessageKey) => string;

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
  });
};

const defaultMessage = (key: RegistrationFormMessageKey) => key;

export const RegistrationFormInputSchema =
  makeRegistrationFormInputSchema(defaultMessage);

export type RegistrationFormInput = typeof RegistrationFormInputSchema.Type;
export type RegistrationFormValues = typeof RegistrationFormInputSchema.Encoded;

export type RegistrationFormFieldPath =
  | keyof Omit<RegistrationFormValues, "address">
  | `address.${keyof RegistrationFormValues["address"]}`;

export type RegistrationFormFieldErrorCode = "duplicateEmail" | "invalidVatId";

export type RegistrationFormFieldError = FormActionFieldError<
  RegistrationFormFieldPath,
  RegistrationFormFieldErrorCode
>;

export type RegistrationFormValidationErrorCode =
  | "invalidSubmission"
  | "unsupportedRegistrationCountry";

export type RegistrationFormError =
  FormActionFormError<RegistrationFormValidationErrorCode>;

export type RegistrationFormResult =
  | {
      readonly status: "submitted";
      readonly registrationId: string;
      readonly redirectTo?: string;
    }
  | InvalidFormActionResult<
      RegistrationFormFieldPath,
      RegistrationFormFieldErrorCode,
      RegistrationFormValidationErrorCode
    >;
