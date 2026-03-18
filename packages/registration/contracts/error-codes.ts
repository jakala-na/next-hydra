import { z } from "zod";

export const registrationConflictReasonSchema = z.enum([
  "already_approved",
  "already_rejected",
  "not_waiting_for_approval",
  "missing_invitation",
]);

export const registrationOperationSchema = z.enum([
  "submit",
  "get",
  "list",
  "decide",
]);

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

export const unknownRegistrationErrorDataSchema = z
  .object({
    operation: registrationOperationSchema,
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
  message: "Registration operation failed",
  data: unknownRegistrationErrorDataSchema,
} as const;

export const registrationAdminErrorMap = {
  UNAUTHORIZED: unauthorizedRegistrationError,
} as const;

export const registrationSubmitErrorMap = {
  SUBMIT_FAILED: submitFailedRegistrationError,
  UNKNOWN: unknownRegistrationError,
} as const;

export const registrationGetErrorMap = {
  REGISTRATION_NOT_FOUND: registrationNotFoundError,
  UNKNOWN: unknownRegistrationError,
} as const;

export const registrationListErrorMap = {
  UNKNOWN: unknownRegistrationError,
} as const;

export const registrationDecideErrorMap = {
  REGISTRATION_NOT_FOUND: registrationNotFoundError,
  REGISTRATION_CONFLICT: registrationConflictError,
  UNKNOWN: unknownRegistrationError,
} as const;

export type RegistrationConflictReason = z.infer<
  typeof registrationConflictReasonSchema
>;
export type RegistrationOperation = z.infer<typeof registrationOperationSchema>;
export type UnauthorizedRegistrationErrorData = z.infer<
  typeof unauthorizedRegistrationErrorDataSchema
>;
export type RegistrationNotFoundErrorData = z.infer<
  typeof registrationNotFoundErrorDataSchema
>;
export type RegistrationConflictErrorData = z.infer<
  typeof registrationConflictErrorDataSchema
>;
export type SubmitFailedRegistrationErrorData = z.infer<
  typeof submitFailedRegistrationErrorDataSchema
>;
export type UnknownRegistrationErrorData = z.infer<
  typeof unknownRegistrationErrorDataSchema
>;
export type RegistrationErrorDataMap = {
  UNAUTHORIZED: UnauthorizedRegistrationErrorData;
  REGISTRATION_NOT_FOUND: RegistrationNotFoundErrorData;
  REGISTRATION_CONFLICT: RegistrationConflictErrorData;
  SUBMIT_FAILED: SubmitFailedRegistrationErrorData;
  UNKNOWN: UnknownRegistrationErrorData;
};
export type RegistrationErrorCode = keyof RegistrationErrorDataMap;
export type RegistrationErrorData =
  RegistrationErrorDataMap[keyof RegistrationErrorDataMap];
