import { z } from "zod";

export const REGION_REQUIRED_COUNTRY_CODES = ["US", "CA"] as const;

export const requiresRegion = (country: string) =>
  REGION_REQUIRED_COUNTRY_CODES.includes(
    country.toUpperCase() as (typeof REGION_REQUIRED_COUNTRY_CODES)[number]
  );

export const companyAddressSchema = z
  .object({
    streetName: z.string().min(1),
    additionalStreetInfo: z.string().optional(),
    postalCode: z.string().min(1),
    city: z.string().min(1),
    region: z.string().optional(),
    country: z.string().length(2),
  })
  .strict()
  .superRefine((address, ctx) => {
    if (requiresRegion(address.country) && !address.region) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["region"],
        message: "Region is required",
      });
    }
  });

export const registrationInputSchema = z
  .object({
    companyName: z.string().min(1).max(120),
    companyPhone: z.string().max(32).optional(),
    vatId: z.string().max(64).optional(),
    contactFirstName: z.string().min(1).max(80),
    contactLastName: z.string().min(1).max(80),
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
    reason: z.string().max(500).optional(),
    actorEmail: z.string().email().optional(),
    actorName: z.string().max(120).optional(),
  })
  .strict();

export const registrationStatusSchema = z.enum([
  "pending",
  "approved",
  "rejected",
  "workflow_start_failed",
]);

export const invitationStateSchema = z.enum(["pending", "accepted", "revoked"]);

export const registrationRecordSchema = registrationWorkflowInputSchema.extend({
  status: registrationStatusSchema,
  userId: z.string().optional(),
  authEmail: z.string().optional(),
  authFirstName: z.string().optional(),
  authLastName: z.string().optional(),
  invitationId: z.string().optional(),
  invitationState: invitationStateSchema.optional(),
  invitationCreatedAt: z.string().optional(),
  invitationAcceptedAt: z.string().optional(),
  identityLinkedAt: z.string().optional(),
  customerId: z.string().optional(),
  customerKey: z.string().optional(),
  businessUnitId: z.string().optional(),
  businessUnitKey: z.string().optional(),
  hookToken: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  approvedAt: z.string().optional(),
  rejectedAt: z.string().optional(),
  approvalReason: z.string().optional(),
  actorEmail: z.string().optional(),
  actorName: z.string().optional(),
});

export const registrationDetailSchema = registrationRecordSchema.omit({
  hookToken: true,
  customerId: true,
  customerKey: true,
  businessUnitId: true,
  businessUnitKey: true,
});

export const startRegistrationResultSchema = z
  .object({
    registrationId: z.string().uuid(),
    runId: z.string(),
    status: z.literal("pending"),
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
    limit: z.number().int().min(1).max(100).optional(),
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
    status: z.enum(["approved", "rejected", "resumed"]),
    idempotent: z.boolean().optional(),
  })
  .strict();

export type RegistrationInput = z.infer<typeof registrationInputSchema>;
export type RegistrationWorkflowInput = z.infer<
  typeof registrationWorkflowInputSchema
>;
export type RegistrationApprovalDecision = z.infer<
  typeof registrationApprovalDecisionSchema
>;
export type RegistrationStatus = z.infer<typeof registrationStatusSchema>;
export type InvitationState = z.infer<typeof invitationStateSchema>;
export type RegistrationRecord = z.infer<typeof registrationRecordSchema>;
export type RegistrationDetail = z.infer<typeof registrationDetailSchema>;
export type StartRegistrationResult = z.infer<
  typeof startRegistrationResultSchema
>;
export type GetRegistrationInput = z.infer<typeof getRegistrationInputSchema>;
export type ListRegistrationsInput = z.infer<
  typeof listRegistrationsInputSchema
>;
export type ListRegistrationsResult = z.infer<
  typeof listRegistrationsResultSchema
>;
export type DecideRegistrationInput = z.infer<
  typeof decideRegistrationInputSchema
>;
export type DecideRegistrationResult = z.infer<
  typeof decideRegistrationResultSchema
>;
