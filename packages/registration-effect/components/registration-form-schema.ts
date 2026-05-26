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

export const COUNTRY_CODES = [
  "AD",
  "AE",
  "AF",
  "AG",
  "AI",
  "AL",
  "AM",
  "AO",
  "AQ",
  "AR",
  "AS",
  "AT",
  "AU",
  "AW",
  "AX",
  "AZ",
  "BA",
  "BB",
  "BD",
  "BE",
  "BF",
  "BG",
  "BH",
  "BI",
  "BJ",
  "BL",
  "BM",
  "BN",
  "BO",
  "BQ",
  "BR",
  "BS",
  "BT",
  "BV",
  "BW",
  "BY",
  "BZ",
  "CA",
  "CC",
  "CD",
  "CF",
  "CG",
  "CH",
  "CI",
  "CK",
  "CL",
  "CM",
  "CN",
  "CO",
  "CR",
  "CU",
  "CV",
  "CW",
  "CX",
  "CY",
  "CZ",
  "DE",
  "DJ",
  "DK",
  "DM",
  "DO",
  "DZ",
  "EC",
  "EE",
  "EG",
  "EH",
  "ER",
  "ES",
  "ET",
  "FI",
  "FJ",
  "FK",
  "FM",
  "FO",
  "FR",
  "GA",
  "GB",
  "GD",
  "GE",
  "GF",
  "GG",
  "GH",
  "GI",
  "GL",
  "GM",
  "GN",
  "GP",
  "GQ",
  "GR",
  "GS",
  "GT",
  "GU",
  "GW",
  "GY",
  "HK",
  "HM",
  "HN",
  "HR",
  "HT",
  "HU",
  "ID",
  "IE",
  "IL",
  "IM",
  "IN",
  "IO",
  "IQ",
  "IR",
  "IS",
  "IT",
  "JE",
  "JM",
  "JO",
  "JP",
  "KE",
  "KG",
  "KH",
  "KI",
  "KM",
  "KN",
  "KP",
  "KR",
  "KW",
  "KY",
  "KZ",
  "LA",
  "LB",
  "LC",
  "LI",
  "LK",
  "LR",
  "LS",
  "LT",
  "LU",
  "LV",
  "LY",
  "MA",
  "MC",
  "MD",
  "ME",
  "MF",
  "MG",
  "MH",
  "MK",
  "ML",
  "MM",
  "MN",
  "MO",
  "MP",
  "MQ",
  "MR",
  "MS",
  "MT",
  "MU",
  "MV",
  "MW",
  "MX",
  "MY",
  "MZ",
  "NA",
  "NC",
  "NE",
  "NF",
  "NG",
  "NI",
  "NL",
  "NO",
  "NP",
  "NR",
  "NU",
  "NZ",
  "OM",
  "PA",
  "PE",
  "PF",
  "PG",
  "PH",
  "PK",
  "PL",
  "PM",
  "PN",
  "PR",
  "PS",
  "PT",
  "PW",
  "PY",
  "QA",
  "RE",
  "RO",
  "RS",
  "RU",
  "RW",
  "SA",
  "SB",
  "SC",
  "SD",
  "SE",
  "SG",
  "SH",
  "SI",
  "SJ",
  "SK",
  "SL",
  "SM",
  "SN",
  "SO",
  "SR",
  "SS",
  "ST",
  "SV",
  "SX",
  "SY",
  "SZ",
  "TC",
  "TD",
  "TF",
  "TG",
  "TH",
  "TJ",
  "TK",
  "TL",
  "TM",
  "TN",
  "TO",
  "TR",
  "TT",
  "TV",
  "TW",
  "TZ",
  "UA",
  "UG",
  "UM",
  "US",
  "UY",
  "UZ",
  "VA",
  "VC",
  "VE",
  "VG",
  "VI",
  "VN",
  "VU",
  "WF",
  "WS",
  "YE",
  "YT",
  "ZA",
  "ZM",
  "ZW",
] as const;

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
  | "validation.duplicateEmail";

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
  | keyof Omit<RegistrationFormInput, "address">
  | `address.${keyof RegistrationFormInput["address"]}`;

export type RegistrationFormFieldErrorCode = "duplicateEmail" | "invalidVatId";

export type RegistrationFormFieldErrors = Partial<
  Record<RegistrationFormFieldPath, RegistrationFormFieldErrorCode>
>;

export type RegistrationFormErrorCode = "invalidSubmission" | "submitFailed";

export type RegistrationFormResult =
  | {
      readonly _tag: "Success";
      readonly registrationId: string;
      readonly redirectTo?: string;
    }
  | {
      readonly _tag: "FieldErrors";
      readonly errors: RegistrationFormFieldErrors;
    }
  | {
      readonly _tag: "FormError";
      readonly code: RegistrationFormErrorCode;
    };
