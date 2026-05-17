import { z } from "zod";
import type { RegistrationConflictReason } from "../domain/errors";

export const registrationConflictReasonSchema =
  z.custom<RegistrationConflictReason>(
    (value) =>
      value === "approval_not_ready" ||
      value === "registration_submission_incomplete" ||
      value === "approved_registration_cannot_be_rejected" ||
      value === "rejected_registration_cannot_be_approved" ||
      value === "decision_already_in_progress"
  );

export const unauthorizedRegistrationErrorDataSchema = z
  .object({
    reason: z.literal("invalid_approval_secret"),
  })
  .strict();

export const registrationNotFoundErrorDataSchema = z
  .object({
    registrationId: z.string().uuid().optional(),
  })
  .strict();

export const registrationConflictErrorDataSchema = z
  .object({
    registrationId: z.string().uuid().optional(),
    reason: registrationConflictReasonSchema,
  })
  .strict();

export const registrationSubmissionIncompleteErrorDataSchema = z
  .object({
    registrationId: z.string().uuid(),
  })
  .strict();

export const unauthorizedRegistrationError = {
  status: 401,
  message: "Unauthorized",
  data: unauthorizedRegistrationErrorDataSchema,
} as const;

export const registrationNotFoundError = {
  status: 404,
  message: "Registration not found",
  data: registrationNotFoundErrorDataSchema,
} as const;

export const registrationConflictError = {
  status: 409,
  message: "Registration conflict",
  data: registrationConflictErrorDataSchema,
} as const;

export const registrationSubmissionIncompleteError = {
  status: 500,
  message: "Registration submission incomplete",
  data: registrationSubmissionIncompleteErrorDataSchema,
} as const;

export const registrationAdminErrorMap = {
  UNAUTHORIZED: unauthorizedRegistrationError,
} as const;

export const registrationSubmitErrorMap = {
  REGISTRATION_SUBMISSION_INCOMPLETE: registrationSubmissionIncompleteError,
} as const;

export const registrationGetErrorMap = {
  ...registrationAdminErrorMap,
  REGISTRATION_NOT_FOUND: registrationNotFoundError,
} as const;

export const registrationListErrorMap = {
  ...registrationAdminErrorMap,
} as const;

export const registrationDecideErrorMap = {
  ...registrationAdminErrorMap,
  REGISTRATION_NOT_FOUND: registrationNotFoundError,
  REGISTRATION_CONFLICT: registrationConflictError,
} as const;

export type {
  RegistrationConflictErrorData,
  RegistrationConflictReason,
  RegistrationErrorCode,
  RegistrationErrorData,
  RegistrationErrorDataMap,
  RegistrationNotFoundErrorData,
  RegistrationSubmissionIncompleteErrorData,
} from "../domain/errors";

export type UnauthorizedRegistrationErrorData = z.infer<
  typeof unauthorizedRegistrationErrorDataSchema
>;
