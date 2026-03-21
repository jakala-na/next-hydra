import type { MessageKeys, Messages, NestedKeyOf } from "@repo/i18n";
import { Result } from "better-result";
import {
  RegistrationApprovalProcessError,
  type RegistrationResult,
  RegistrationStoreError,
  RegistrationSubmitFailedError,
} from "../domain/errors";
import type {
  RegistrationApprovalProcessPort,
  RegistrationIdPort,
  RegistrationStorePort,
} from "../domain/ports";
import type {
  RegistrationInput,
  RegistrationWorkflowInput,
  StartRegistrationResult,
} from "../domain/types";

type RegistrationMessageKey = MessageKeys<
  Messages["web"]["registration"],
  NestedKeyOf<Messages["web"]["registration"]>
>;

type CreateSubmitRegistrationOptions = {
  registrations: RegistrationStorePort;
  approvalProcess: RegistrationApprovalProcessPort;
  ids: RegistrationIdPort;
};

export function createSubmitRegistration(
  options: CreateSubmitRegistrationOptions
) {
  return async function submitRegistration(
    input: RegistrationInput
  ): Promise<RegistrationResult<StartRegistrationResult>> {
    const registrationId = options.ids.create();
    const workflowInput: RegistrationWorkflowInput = {
      ...input,
      registrationId,
    };

    const createRecordResult = await Result.tryPromise({
      try: () =>
        options.registrations.createPendingRegistrationRecord(workflowInput),
      catch: (cause) =>
        new RegistrationStoreError({
          operation: "create_pending_registration_record",
          cause,
        }),
    });

    if (createRecordResult.isErr()) {
      return createRecordResult;
    }

    const runResult = await Result.tryPromise({
      try: () => options.approvalProcess.startWorkflow(workflowInput),
      catch: (cause) =>
        new RegistrationApprovalProcessError({
          operation: "start_workflow",
          cause,
        }),
    });

    if (runResult.isErr()) {
      const compensationResult = await Result.tryPromise({
        try: () =>
          options.registrations.markRegistrationWorkflowStartFailed(
            workflowInput,
            "gate.failed.description" as RegistrationMessageKey
          ),
        catch: (cause) =>
          new RegistrationStoreError({
            operation: "mark_registration_workflow_start_failed",
            cause,
          }),
      });

      return Result.err(
        new RegistrationSubmitFailedError({
          reason: "workflow_start_failed",
          cause: runResult.error.cause,
          compensationCause: compensationResult.isErr()
            ? compensationResult.error.cause
            : undefined,
        })
      );
    }

    return Result.ok({
      registrationId,
      runId: runResult.value.runId,
      status: "pending",
    });
  };
}
