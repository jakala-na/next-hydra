import {
  RegistrationNotFoundError,
  RegistrationStoreError,
} from "@repo/registration/domain/errors";
import type { RegistrationStorePort } from "@repo/registration/domain/ports";
import type {
  RegistrationRecord,
  RegistrationWorkflowInput,
} from "@repo/registration/domain/types";
import { Result } from "better-result";
import {
  createPendingRegistrationRecord as createPendingRegistrationRecordInStore,
  getRegistrationRecord as getRegistrationRecordFromStore,
  listRegistrationRecords as listRegistrationRecordsFromStore,
  markRegistrationWorkflowStartFailed as markRegistrationWorkflowStartFailedInStore,
} from "./service";

type CommercetoolsRegistrationStoreDependencies = {
  createPendingRegistrationRecord(
    input: RegistrationWorkflowInput
  ): Promise<RegistrationRecord>;
  getRegistrationRecord(
    registrationId: string
  ): Promise<RegistrationRecord | null>;
  listRegistrationRecords(limit: number): Promise<RegistrationRecord[]>;
  markRegistrationWorkflowStartFailed(
    input: RegistrationWorkflowInput,
    reason?: string
  ): Promise<RegistrationRecord>;
};

const defaultDependencies: CommercetoolsRegistrationStoreDependencies = {
  createPendingRegistrationRecord: createPendingRegistrationRecordInStore,
  getRegistrationRecord: getRegistrationRecordFromStore,
  listRegistrationRecords: listRegistrationRecordsFromStore,
  markRegistrationWorkflowStartFailed:
    markRegistrationWorkflowStartFailedInStore,
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
    markRegistrationWorkflowStartFailed(input, reason) {
      return Result.tryPromise({
        try: () =>
          dependencies.markRegistrationWorkflowStartFailed(input, reason),
        catch: (cause: unknown): RegistrationStoreError =>
          new RegistrationStoreError({
            operation: "mark_registration_workflow_start_failed",
            cause,
          }),
      });
    },
  };
}
