import type { Result } from "better-result";
import type {
  RegistrationApprovalProcessError,
  RegistrationNotFoundError,
  RegistrationStoreError,
} from "./errors";
import type {
  RegistrationApprovalDecision,
  RegistrationRecord,
  RegistrationWorkflowInput,
  StartRegistrationResult,
} from "./types";

export type RegistrationStoreResult<T> = Result<T, RegistrationStoreError>;

export type RegistrationStoreLookupResult<T> = Result<
  T,
  RegistrationNotFoundError | RegistrationStoreError
>;

export type RegistrationApprovalProcessResult<T> = Result<
  T,
  RegistrationApprovalProcessError
>;

export type RegistrationStorePort = {
  createPendingRegistrationRecord(
    input: RegistrationWorkflowInput
  ): Promise<RegistrationStoreResult<RegistrationRecord>>;
  markRegistrationApprovalProcessing(
    registrationId: string,
    approval: RegistrationApprovalDecision
  ): Promise<RegistrationStoreResult<RegistrationRecord>>;
  markRegistrationSubmissionIncomplete(
    input: RegistrationWorkflowInput
  ): Promise<RegistrationStoreResult<RegistrationRecord>>;
  getRegistrationRecord(
    registrationId: string
  ): Promise<RegistrationStoreLookupResult<RegistrationRecord>>;
  listRegistrationRecords(
    limit: number
  ): Promise<RegistrationStoreResult<RegistrationRecord[]>>;
};

export type RegistrationApprovalProcessPort = {
  startWorkflow(
    input: RegistrationWorkflowInput
  ): Promise<
    RegistrationApprovalProcessResult<Pick<StartRegistrationResult, "runId">>
  >;
  resumeApproval(
    hookToken: string,
    approval: RegistrationApprovalDecision
  ): Promise<RegistrationApprovalProcessResult<void>>;
};

export type RegistrationIdPort = {
  create(): string;
};
