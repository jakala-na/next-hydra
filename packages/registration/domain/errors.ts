import { type Result, TaggedError } from "better-result";

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

export type RegistrationValidationIssue = {
  path: Array<string | number>;
  message: string;
  code: string;
};

export type InternalRegistrationErrorData = {
  operation: RegistrationOperation;
  causeName?: string;
  causeMessage?: string;
};

export type OutputValidationRegistrationErrorData = {
  operation: RegistrationOperation;
  issues: RegistrationValidationIssue[];
};

export type RegistrationErrorDataMap = {
  UNAUTHORIZED: UnauthorizedRegistrationErrorData;
  REGISTRATION_NOT_FOUND: RegistrationNotFoundErrorData;
  REGISTRATION_CONFLICT: RegistrationConflictErrorData;
  SUBMIT_FAILED: SubmitFailedRegistrationErrorData;
  REGISTRATION_INTERNAL: InternalRegistrationErrorData;
  REGISTRATION_OUTPUT_VALIDATION_FAILED: OutputValidationRegistrationErrorData;
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

export class RegistrationSubmitFailedError extends TaggedError(
  "RegistrationSubmitFailedError"
)<
  SubmitFailedRegistrationErrorData & {
    message: string;
    cause: unknown;
    compensationCause?: unknown;
  }
>() {
  constructor(
    args: SubmitFailedRegistrationErrorData & {
      cause: unknown;
      compensationCause?: unknown;
    }
  ) {
    super({
      ...args,
      message: "Registration workflow failed to start",
    });
  }
}

export type RegistrationStoreOperation =
  | "create_pending_registration_record"
  | "mark_registration_workflow_start_failed"
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

export class RegistrationUnknownError extends TaggedError(
  "RegistrationUnknownError"
)<InternalRegistrationErrorData & { message: string; cause: unknown }>() {
  constructor(args: InternalRegistrationErrorData & { cause: unknown }) {
    super({
      ...args,
      message: `Registration ${args.operation} failed`,
    });
  }
}

export type RegistrationError =
  | RegistrationNotFoundError
  | RegistrationConflictError
  | RegistrationSubmitFailedError
  | RegistrationStoreError
  | RegistrationApprovalProcessError
  | RegistrationUnknownError;

export type RegistrationResult<T> = Result<T, RegistrationError>;
