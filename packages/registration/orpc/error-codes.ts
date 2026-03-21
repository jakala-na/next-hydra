import { z } from "zod";
import type {
  RegistrationConflictReason,
  RegistrationOperation,
} from "../domain/errors";

export const registrationConflictReasonSchema =
  z.custom<RegistrationConflictReason>(
    (value) =>
      value === "already_approved" ||
      value === "already_rejected" ||
      value === "not_waiting_for_approval" ||
      value === "missing_invitation"
  );

export const registrationOperationSchema = z.custom<RegistrationOperation>(
  (value) =>
    value === "submit" ||
    value === "get" ||
    value === "list" ||
    value === "decide"
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

export const submitFailedRegistrationErrorDataSchema = z
  .object({
    reason: z.enum(["workflow_start_failed", "unexpected"]),
  })
  .strict();

export const internalRegistrationErrorDataSchema = z
  .object({
    operation: registrationOperationSchema,
    causeName: z.string().optional(),
    causeMessage: z.string().optional(),
  })
  .strict();

export const outputValidationRegistrationErrorDataSchema = z
  .object({
    operation: registrationOperationSchema,
    issues: z.array(
      z
        .object({
          path: z.array(z.union([z.string(), z.number()])),
          message: z.string(),
          code: z.string(),
        })
        .strict()
    ),
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

export const submitFailedRegistrationError = {
  status: 500,
  message: "Registration submit failed",
  data: submitFailedRegistrationErrorDataSchema,
} as const;

export const unknownRegistrationError = {
  status: 500,
  message: "Registration internal error",
  data: internalRegistrationErrorDataSchema,
} as const;

export const outputValidationRegistrationError = {
  status: 500,
  message: "Registration output validation failed",
  data: outputValidationRegistrationErrorDataSchema,
} as const;

export const registrationAdminErrorMap = {
  UNAUTHORIZED: unauthorizedRegistrationError,
} as const;

export const registrationSubmitErrorMap = {
  SUBMIT_FAILED: submitFailedRegistrationError,
  REGISTRATION_INTERNAL: unknownRegistrationError,
  REGISTRATION_OUTPUT_VALIDATION_FAILED: outputValidationRegistrationError,
} as const;

export const registrationGetErrorMap = {
  ...registrationAdminErrorMap,
  REGISTRATION_NOT_FOUND: registrationNotFoundError,
  REGISTRATION_INTERNAL: unknownRegistrationError,
  REGISTRATION_OUTPUT_VALIDATION_FAILED: outputValidationRegistrationError,
} as const;

export const registrationListErrorMap = {
  ...registrationAdminErrorMap,
  REGISTRATION_INTERNAL: unknownRegistrationError,
  REGISTRATION_OUTPUT_VALIDATION_FAILED: outputValidationRegistrationError,
} as const;

export const registrationDecideErrorMap = {
  ...registrationAdminErrorMap,
  REGISTRATION_NOT_FOUND: registrationNotFoundError,
  REGISTRATION_CONFLICT: registrationConflictError,
  REGISTRATION_INTERNAL: unknownRegistrationError,
  REGISTRATION_OUTPUT_VALIDATION_FAILED: outputValidationRegistrationError,
} as const;

export type {
  InternalRegistrationErrorData,
  OutputValidationRegistrationErrorData,
  RegistrationConflictErrorData,
  RegistrationConflictReason,
  RegistrationErrorCode,
  RegistrationErrorData,
  RegistrationErrorDataMap,
  RegistrationNotFoundErrorData,
  RegistrationOperation,
  RegistrationValidationIssue,
  SubmitFailedRegistrationErrorData,
  UnauthorizedRegistrationErrorData,
} from "../domain/errors";
