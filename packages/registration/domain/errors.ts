import { type Result, TaggedError } from "better-result";

export type RegistrationConflictReason =
  | "approval_not_ready"
  | "registration_submission_incomplete"
  | "approved_registration_cannot_be_rejected"
  | "rejected_registration_cannot_be_approved"
  | "decision_already_in_progress";

export type RegistrationNotFoundErrorData = {
  registrationId?: string;
};

export type RegistrationConflictErrorData = {
  registrationId?: string;
  reason: RegistrationConflictReason;
};

export type RegistrationSubmissionIncompleteErrorData = {
  registrationId: string;
};

export type RegistrationErrorDataMap = {
  REGISTRATION_NOT_FOUND: RegistrationNotFoundErrorData;
  REGISTRATION_CONFLICT: RegistrationConflictErrorData;
  REGISTRATION_SUBMISSION_INCOMPLETE: RegistrationSubmissionIncompleteErrorData;
};

export type RegistrationErrorCode = keyof RegistrationErrorDataMap;
export type RegistrationErrorData =
  RegistrationErrorDataMap[keyof RegistrationErrorDataMap];

export class RegistrationNotFoundError extends TaggedError(
  "RegistrationNotFoundError"
)<RegistrationNotFoundErrorData & { message: string }>() {
  constructor(args: RegistrationNotFoundErrorData = {}) {
    super({
      ...args,
      message: "Registration not found",
    });
  }
}

export class RegistrationConflictError extends TaggedError(
  "RegistrationConflictError"
)<RegistrationConflictErrorData & { message: string }>() {
  constructor(args: RegistrationConflictErrorData) {
    super({
      ...args,
      message: "Registration cannot be processed in its current state",
    });
  }
}

export class RegistrationSubmissionIncompleteError extends TaggedError(
  "RegistrationSubmissionIncompleteError"
)<
  RegistrationSubmissionIncompleteErrorData & {
    message: string;
    cause: unknown;
  }
>() {
  constructor(
    args: RegistrationSubmissionIncompleteErrorData & { cause: unknown }
  ) {
    super({
      ...args,
      message: "Registration submission is incomplete",
    });
  }
}

export type RegistrationStoreOperation =
  | "create_pending_registration_record"
  | "mark_registration_approval_processing"
  | "mark_registration_submission_incomplete"
  | "get_registration_record"
  | "list_registration_records";

export class RegistrationStoreError extends TaggedError(
  "RegistrationStoreError"
)<{
  operation: RegistrationStoreOperation;
  message: string;
  cause: unknown;
}>() {
  constructor(args: {
    operation: RegistrationStoreOperation;
    cause: unknown;
  }) {
    super({
      ...args,
      message: `Registration store operation failed: ${args.operation}`,
    });
  }
}

export type RegistrationApprovalProcessOperation =
  | "start_workflow"
  | "resume_approval";

export class RegistrationApprovalProcessError extends TaggedError(
  "RegistrationApprovalProcessError"
)<{
  operation: RegistrationApprovalProcessOperation;
  message: string;
  cause: unknown;
}>() {
  constructor(args: {
    operation: RegistrationApprovalProcessOperation;
    cause: unknown;
  }) {
    super({
      ...args,
      message: `Registration approval process failed: ${args.operation}`,
    });
  }
}

export type RegistrationError =
  | RegistrationNotFoundError
  | RegistrationConflictError
  | RegistrationSubmissionIncompleteError;

export type RegistrationResult<
  T,
  TError extends RegistrationError = RegistrationError,
> = Result<T, TError>;
