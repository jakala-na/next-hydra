import type { MessageKeys, Messages, NestedKeyOf } from "@repo/i18n";
import {
  type RegistrationActionResult,
  submitFailedRegistrationError,
  unknownRegistrationError,
} from "../domain/errors";
import type {
  RegistrationApprovalProcessPort,
  RegistrationIdPort,
  RegistrationStorePort,
} from "../domain/ports";
import { Err, Ok } from "../domain/result";
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
  ): Promise<RegistrationActionResult<StartRegistrationResult>> {
    const registrationId = options.ids.create();
    const workflowInput: RegistrationWorkflowInput = {
      ...input,
      registrationId,
    };

    try {
      await options.registrations.createPendingRegistrationRecord(
        workflowInput
      );
      const run = await options.approvalProcess.startWorkflow(workflowInput);

      return Ok({
        registrationId,
        runId: run.runId,
        status: "pending",
      });
    } catch (error) {
      try {
        await options.registrations.markRegistrationWorkflowStartFailed(
          workflowInput,
          "gate.failed.description" as RegistrationMessageKey
        );
      } catch (markError) {
        return Err(unknownRegistrationError("submit", markError));
      }

      return Err(submitFailedRegistrationError(error));
    }
  };
}
