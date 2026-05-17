import {
  RegistrationNotFoundError,
  RegistrationStoreError,
} from "@repo/registration/domain/errors";
import type { RegistrationStorePort } from "@repo/registration/domain/ports";
import type {
  RegistrationApprovalDecision,
  RegistrationRecord,
  RegistrationWorkflowInput,
} from "@repo/registration/domain/types";
import { Result } from "better-result";
import {
  createPendingRegistrationRecord as createPendingRegistrationRecordInStore,
  getRegistrationRecord as getRegistrationRecordFromStore,
  listRegistrationRecords as listRegistrationRecordsFromStore,
  markRegistrationApprovalProcessing as markRegistrationApprovalProcessingInStore,
  markRegistrationSubmissionIncomplete as markRegistrationSubmissionIncompleteInStore,
} from "./service";

type CommercetoolsRegistrationStoreDependencies = {
  createPendingRegistrationRecord(
    input: RegistrationWorkflowInput
  ): Promise<RegistrationRecord>;
  getRegistrationRecord(
    registrationId: string
  ): Promise<RegistrationRecord | null>;
  listRegistrationRecords(limit: number): Promise<RegistrationRecord[]>;
  markRegistrationApprovalProcessing(
    registrationId: string,
    approval: RegistrationApprovalDecision
  ): Promise<RegistrationRecord>;
  markRegistrationSubmissionIncomplete(
    input: RegistrationWorkflowInput
  ): Promise<RegistrationRecord>;
};

const defaultDependencies: CommercetoolsRegistrationStoreDependencies = {
  createPendingRegistrationRecord: createPendingRegistrationRecordInStore,
  getRegistrationRecord: getRegistrationRecordFromStore,
  listRegistrationRecords: listRegistrationRecordsFromStore,
  markRegistrationApprovalProcessing: markRegistrationApprovalProcessingInStore,
  markRegistrationSubmissionIncomplete:
    markRegistrationSubmissionIncompleteInStore,
};

export function createCommercetoolsRegistrationStore(
  dependencies: CommercetoolsRegistrationStoreDependencies = defaultDependencies
): RegistrationStorePort {
  return {
    createPendingRegistrationRecord(input) {
      return Result.tryPromise({
        try: () => dependencies.createPendingRegistrationRecord(input),
        catch: (cause: unknown): RegistrationStoreError =>
          new RegistrationStoreError({
            operation: "create_pending_registration_record",
            cause,
          }),
      });
    },
    async getRegistrationRecord(registrationId) {
      const recordResult = await Result.tryPromise({
        try: () => dependencies.getRegistrationRecord(registrationId),
        catch: (cause: unknown): RegistrationStoreError =>
          new RegistrationStoreError({
            operation: "get_registration_record",
            cause,
          }),
      });

      if (recordResult.isErr()) {
        return recordResult;
      }

      if (!recordResult.value) {
        return Result.err<RegistrationRecord, RegistrationNotFoundError>(
          new RegistrationNotFoundError({ registrationId })
        );
      }

      return Result.ok(recordResult.value);
    },
    listRegistrationRecords(limit) {
      return Result.tryPromise({
        try: () => dependencies.listRegistrationRecords(limit),
        catch: (cause: unknown): RegistrationStoreError =>
          new RegistrationStoreError({
            operation: "list_registration_records",
            cause,
          }),
      });
    },
    markRegistrationApprovalProcessing(registrationId, approval) {
      return Result.tryPromise({
        try: () =>
          dependencies.markRegistrationApprovalProcessing(
            registrationId,
            approval
          ),
        catch: (cause: unknown): RegistrationStoreError =>
          new RegistrationStoreError({
            operation: "mark_registration_approval_processing",
            cause,
          }),
      });
    },
    markRegistrationSubmissionIncomplete(input) {
      return Result.tryPromise({
        try: () => dependencies.markRegistrationSubmissionIncomplete(input),
        catch: (cause: unknown): RegistrationStoreError =>
          new RegistrationStoreError({
            operation: "mark_registration_submission_incomplete",
            cause,
          }),
      });
    },
  };
}
