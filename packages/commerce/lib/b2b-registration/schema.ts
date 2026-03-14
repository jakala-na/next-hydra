import { z } from "zod";
import { registrationMessageKey } from "./message-keys";

const trimString = (value: unknown) =>
  typeof value === "string" ? value.trim() : value;

const emptyStringToUndefined = (value: unknown) => {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
};

const requiredText = <T extends z.ZodString>(schema: T) =>
  z.preprocess(trimString, schema);

const optionalText = <T extends z.ZodString>(schema: T) =>
  z.preprocess(emptyStringToUndefined, schema.optional());

export const REGION_REQUIRED_COUNTRY_CODES = ["US", "CA"] as const;

export const requiresRegion = (country: string) =>
  REGION_REQUIRED_COUNTRY_CODES.includes(
    country.trim().toUpperCase() as (typeof REGION_REQUIRED_COUNTRY_CODES)[number]
  );

export const companyAddressSchema = z.object({
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
  country: z.preprocess(
    (value) =>
      typeof value === "string" ? value.trim().toUpperCase() : value,
    z.string().length(2, registrationMessageKey("validation.country"))
  ),
})
  .strict()
  .superRefine((address, ctx) => {
    if (requiresRegion(address.country) && !address.region) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["region"],
        message: registrationMessageKey("validation.region"),
      });
    }
  });

export const registrationInputSchema = z.object({
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
  address: companyAddressSchema,
}).strict();

export const registrationWorkflowInputSchema = registrationInputSchema.extend({
  registrationId: z.string().uuid(),
});

export const registrationApprovalDecisionSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  reason: z.string().max(500).optional(),
  actorEmail: z.string().email().optional(),
  actorName: z.string().max(120).optional(),
}).strict();

export const registrationStatusSchema = z.enum([
  "pending",
  "approved",
  "rejected",
  "workflow_start_failed",
]);

export const registrationInvitationStateSchema = z.enum([
  "pending",
  "accepted",
  "revoked",
]);

export type RegistrationInput = z.infer<typeof registrationInputSchema>;
export type RegistrationWorkflowInput = z.infer<
  typeof registrationWorkflowInputSchema
>;
export type RegistrationApprovalDecision = z.infer<
  typeof registrationApprovalDecisionSchema
>;
export type RegistrationStatus = z.infer<typeof registrationStatusSchema>;
export type RegistrationInvitationState = z.infer<
  typeof registrationInvitationStateSchema
>;

export type RegistrationRecord = RegistrationWorkflowInput & {
  status: RegistrationStatus;
  workosUserId?: string;
  authEmail?: string;
  authFirstName?: string;
  authLastName?: string;
  invitationId?: string;
  invitationState?: RegistrationInvitationState;
  invitedAt?: string;
  invitationAcceptedAt?: string;
  identitySyncedAt?: string;
  customerId?: string;
  customerKey?: string;
  businessUnitId?: string;
  businessUnitKey?: string;
  hookToken?: string;
  createdAt: string;
  updatedAt: string;
  approvedAt?: string;
  rejectedAt?: string;
  approvalReason?: string;
  actorEmail?: string;
  actorName?: string;
};
