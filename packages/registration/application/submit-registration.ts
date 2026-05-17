import { Result } from "better-result";
import {
  type RegistrationResult,
  RegistrationSubmissionIncompleteError,
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
  ): Promise<
    RegistrationResult<
      StartRegistrationResult,
      RegistrationSubmissionIncompleteError
    >
  > {
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
      throw createRecordResult.error;
    }

    const runResult =
      await options.approvalProcess.startWorkflow(workflowInput);

    if (runResult.isErr()) {
      const compensationResult =
        await options.registrations.markRegistrationSubmissionIncomplete(
          workflowInput
        );

      if (compensationResult.isErr()) {
        throw compensationResult.error;
      }

      return Result.err(
        new RegistrationSubmissionIncompleteError({
          registrationId,
          cause: runResult.error.cause,
        })
      );
    }

    return Result.ok({
      registrationId,
      runId: runResult.value.runId,
      status: "submitted",
    });
  };
}
