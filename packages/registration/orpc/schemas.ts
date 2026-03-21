import { z } from "zod";
import { REGISTRATION_FIELD_LIMITS, requiresRegion } from "../domain/types";

const optionalString = (schema: z.ZodString) =>
  schema.nullish().transform((value) => value ?? undefined);

export const companyAddressSchema = z
  .object({
    streetName: z.string().min(1),
    additionalStreetInfo: optionalString(z.string()),
    postalCode: z.string().min(1),
    city: z.string().min(1),
    region: optionalString(z.string()),
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
    companyName: z.string().min(1).max(REGISTRATION_FIELD_LIMITS.companyName),
    companyPhone: optionalString(
      z.string().max(REGISTRATION_FIELD_LIMITS.companyPhone)
    ),
    vatId: optionalString(z.string().max(REGISTRATION_FIELD_LIMITS.vatId)),
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
    actorEmail: optionalString(z.string().email()),
    actorName: optionalString(
      z.string().max(REGISTRATION_FIELD_LIMITS.actorName)
    ),
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
  hookToken: optionalString(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
  approvedAt: optionalString(z.string()),
  rejectedAt: optionalString(z.string()),
  approvalReason: optionalString(z.string()),
  actorEmail: optionalString(z.string()),
  actorName: optionalString(z.string()),
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
    status: z.enum(["approved", "rejected", "resumed"]),
    idempotent: z.boolean().optional(),
  })
  .strict();
