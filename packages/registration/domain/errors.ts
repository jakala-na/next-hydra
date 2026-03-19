import { type ActionResult, domainError } from "./result";

export type RegistrationConflictReason =
  | "already_approved"
  | "already_rejected"
  | "not_waiting_for_approval"
  | "missing_invitation";

export type RegistrationOperation = "submit" | "get" | "list" | "decide";

export type UnauthorizedRegistrationErrorData = {
  reason: "invalid_approval_secret";
};

export type RegistrationNotFoundErrorData = {
  registrationId?: string;
};

export type RegistrationConflictErrorData = {
  registrationId?: string;
  reason: RegistrationConflictReason;
};

export type SubmitFailedRegistrationErrorData = {
  reason: "workflow_start_failed" | "unexpected";
};

export type UnknownRegistrationErrorData = {
  operation: RegistrationOperation;
};

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

export type RegistrationActionResult<T> = ActionResult<
  T,
  RegistrationErrorCode,
  RegistrationErrorData
>;

export const unknownRegistrationError = (
  operation: RegistrationOperation,
  cause: unknown
) =>
  domainError(
    "UNKNOWN",
    `Registration ${operation} failed`,
    { operation },
    cause
  );

export const submitFailedRegistrationError = (cause: unknown) =>
  domainError(
    "SUBMIT_FAILED",
    "Registration workflow failed to start",
    { reason: "workflow_start_failed" as const },
    cause
  );

export const registrationNotFoundError = (registrationId?: string) =>
  domainError(
    "REGISTRATION_NOT_FOUND",
    "Registration not found",
    registrationId ? { registrationId } : {}
  );

export const registrationConflictError = (
  reason: RegistrationConflictReason,
  registrationId?: string
) =>
  domainError(
    "REGISTRATION_CONFLICT",
    "Registration cannot be processed in its current state",
    {
      registrationId,
      reason,
    }
  );
