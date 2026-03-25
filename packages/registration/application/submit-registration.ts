import type { MessageKeys, Messages, NestedKeyOf } from "@repo/i18n";
import { Result } from "better-result";
import {
  type RegistrationResult,
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

    const createRecordResult =
      await options.registrations.createPendingRegistrationRecord(
        workflowInput
      );

    if (createRecordResult.isErr()) {
      return Result.err(createRecordResult.error);
    }

    const runResult =
      await options.approvalProcess.startWorkflow(workflowInput);

    if (runResult.isErr()) {
      const compensationResult =
        await options.registrations.markRegistrationWorkflowStartFailed(
          workflowInput,
          "gate.failed.description" as RegistrationMessageKey
        );

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
