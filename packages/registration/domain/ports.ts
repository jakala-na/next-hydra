import type {
  RegistrationApprovalDecision,
  RegistrationRecord,
  RegistrationWorkflowInput,
  StartRegistrationResult,
} from "./types";

export type RegistrationStorePort = {
  createPendingRegistrationRecord(
    input: RegistrationWorkflowInput
  ): Promise<RegistrationRecord>;
  markRegistrationWorkflowStartFailed(
    input: RegistrationWorkflowInput,
    reason?: string
  ): Promise<RegistrationRecord>;
  getRegistrationRecord(
    registrationId: string
  ): Promise<RegistrationRecord | null>;
  listRegistrationRecords(limit: number): Promise<RegistrationRecord[]>;
};

export type RegistrationApprovalProcessPort = {
  startWorkflow(
    input: RegistrationWorkflowInput
  ): Promise<Pick<StartRegistrationResult, "runId">>;
  resumeApproval(
    hookToken: string,
    approval: RegistrationApprovalDecision
  ): Promise<void>;
};

export type RegistrationIdPort = {
  create(): string;
};
