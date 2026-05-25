import { z } from "zod";
import { REGISTRATION_FIELD_LIMITS, requiresRegion } from "./types";

const optionalString = (schema: z.ZodString) =>
  schema.nullish().transform((value) => value ?? undefined);

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

const countryCodeSchema = z
  .string()
  .refine((value) =>
    COUNTRY_CODES.includes(value as (typeof COUNTRY_CODES)[number])
  );

export const companyAddressSchema = z
  .object({
    streetName: z.string().min(1),
    additionalStreetInfo: z.string(),
    postalCode: z.string().min(1),
    city: z.string().min(1),
    region: z.string(),
    country: countryCodeSchema,
  })
  .strict()
  .superRefine((address, ctx) => {
    if (requiresRegion(address.country) && !address.region) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["region"],
      });
    }
  });

export const registrationInputSchema = z
  .object({
    companyName: z.string().min(1).max(REGISTRATION_FIELD_LIMITS.companyName),
    companyPhone: z.string().max(REGISTRATION_FIELD_LIMITS.companyPhone),
    vatId: z.string().max(REGISTRATION_FIELD_LIMITS.vatId),
    contactFirstName: z
      .string()
      .min(1)
      .max(REGISTRATION_FIELD_LIMITS.contactName),
    contactLastName: z
      .string()
      .min(1)
      .max(REGISTRATION_FIELD_LIMITS.contactName),
    email: z.string().email(),
    address: companyAddressSchema,
  })
  .strict();

export const registrationWorkflowInputSchema = registrationInputSchema.extend({
  registrationId: z.string().uuid(),
});

export const registrationApprovalDecisionSchema = z
  .object({
    decision: z.enum(["approved", "rejected"]),
    reason: optionalString(
      z.string().max(REGISTRATION_FIELD_LIMITS.approvalReason)
    ),
    actorEmail: z.string().email(),
    actorName: z.string().min(1).max(REGISTRATION_FIELD_LIMITS.actorName),
  })
  .strict();

export const registrationStatusSchema = z.enum([
  "submitted",
  "awaiting_approval",
  "approval_processing",
  "submission_incomplete",
  "approved",
  "rejected",
]);

export const invitationStateSchema = z.enum(["pending", "accepted", "revoked"]);

export const registrationRecordSchema = registrationWorkflowInputSchema.extend({
  status: registrationStatusSchema,
  userId: optionalString(z.string()),
  authEmail: optionalString(z.string()),
  authFirstName: optionalString(z.string()),
  authLastName: optionalString(z.string()),
  invitationId: optionalString(z.string()),
  invitationState: invitationStateSchema
    .nullable()
    .optional()
    .transform((value) => value ?? undefined),
  invitationCreatedAt: optionalString(z.string()),
  invitationAcceptedAt: optionalString(z.string()),
  identityLinkedAt: optionalString(z.string()),
  customerId: optionalString(z.string()),
  customerKey: optionalString(z.string()),
  businessUnitId: optionalString(z.string()),
  businessUnitKey: optionalString(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
  approvedAt: optionalString(z.string()),
  rejectedAt: optionalString(z.string()),
  approvalDecision: z.enum(["approved", "rejected"]).optional(),
  approvalReason: optionalString(z.string()),
  actorEmail: optionalString(z.string()),
  actorName: optionalString(z.string()),
  decisionSubmittedAt: optionalString(z.string()),
});

export const registrationDetailSchema = registrationRecordSchema.omit({
  customerId: true,
  customerKey: true,
  businessUnitId: true,
  businessUnitKey: true,
});

export const startRegistrationResultSchema = z
  .object({
    registrationId: z.string().uuid(),
    runId: z.string(),
    status: z.literal("submitted"),
  })
  .strict();

export const getRegistrationInputSchema = z
  .object({
    registrationId: z.string().uuid(),
  })
  .strict();

export const listRegistrationsInputSchema = z
  .object({
    status: registrationStatusSchema.optional(),
    search: z.string().min(1).optional(),
    cursor: z.string().optional(),
    limit: z
      .number()
      .int()
      .min(1)
      .max(REGISTRATION_FIELD_LIMITS.listLimit)
      .optional(),
  })
  .strict();

export const listRegistrationsResultSchema = z
  .object({
    items: z.array(registrationDetailSchema),
    nextCursor: z.string().optional(),
  })
  .strict();

export const decideRegistrationInputSchema =
  registrationApprovalDecisionSchema.extend({
    registrationId: z.string().uuid(),
  });

export const decideRegistrationResultSchema = z
  .object({
    registrationId: z.string().uuid(),
    status: z.enum(["approval_processing", "approved", "rejected"]),
    idempotent: z.boolean().optional(),
  })
  .strict();
