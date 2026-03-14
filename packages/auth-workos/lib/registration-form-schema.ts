import { registrationMessageKey } from "@repo/commerce/lib/b2b-registration/message-keys";
import { requiresRegion } from "@repo/commerce/lib/b2b-registration/schema";
import { z } from "zod";

const requiredText = (schema: z.ZodString) => z.string().trim().pipe(schema);

const optionalText = (schema: z.ZodString) =>
  z
    .string()
    .trim()
    .superRefine((value, ctx) => {
      if (value === "") {
        return;
      }

      const result = schema.safeParse(value);
      if (!result.success) {
        for (const issue of result.error.issues) {
          ctx.addIssue(issue);
        }
      }
    });

const countryCodeSchema = z
  .string()
  .transform((value) => value.trim().toUpperCase())
  .pipe(z.string().length(2, registrationMessageKey("validation.country")));

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

export const getCountryOptions = (locale: string) => {
  const countryDisplayNames = new Intl.DisplayNames([locale], {
    type: "region",
  });

  return COUNTRY_CODES.map((value) => ({
    value,
    label: countryDisplayNames.of(value) ?? value,
  })).sort((left, right) => left.label.localeCompare(right.label));
};

export const registrationFormSchema = z
  .object({
    apiBaseUrl: requiredText(
      z.string().url(registrationMessageKey("errors.submitFailed"))
    ),
    companyName: requiredText(
      z
        .string()
        .min(2, registrationMessageKey("validation.companyName"))
        .max(120, registrationMessageKey("validation.companyNameMax"))
    ),
    companyPhone: optionalText(
      z
        .string()
        .min(7, registrationMessageKey("validation.companyPhone"))
        .max(32, registrationMessageKey("validation.companyPhone"))
    ),
    vatId: optionalText(
      z.string().max(64, registrationMessageKey("validation.vatId"))
    ),
    contactFirstName: requiredText(
      z
        .string()
        .min(1, registrationMessageKey("validation.firstName"))
        .max(80, registrationMessageKey("validation.firstNameMax"))
    ),
    contactLastName: requiredText(
      z
        .string()
        .min(1, registrationMessageKey("validation.lastName"))
        .max(80, registrationMessageKey("validation.lastNameMax"))
    ),
    email: requiredText(
      z.string().email(registrationMessageKey("validation.email"))
    ),
    address: z.object({
      streetName: requiredText(
        z.string().min(1, registrationMessageKey("validation.streetAddress"))
      ),
      additionalStreetInfo: optionalText(z.string()),
      postalCode: requiredText(
        z.string().min(1, registrationMessageKey("validation.postalCode"))
      ),
      city: requiredText(
        z.string().min(1, registrationMessageKey("validation.city"))
      ),
      region: optionalText(z.string()),
      country: countryCodeSchema,
    }),
  })
  .superRefine((values, ctx) => {
    if (requiresRegion(values.address.country) && !values.address.region) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["address", "region"],
        message: registrationMessageKey("validation.region"),
      });
    }
  });

export type RegistrationFormInput = z.infer<typeof registrationFormSchema>;
