import { RegistrationWorkflow } from "@repo/registration";
import type { InvitationId } from "@repo/registration/domain/identity";
import type { RegistrationInvitationEvent } from "@repo/registration/services/registration-workflow";
import { Effect, ManagedRuntime } from "effect";
import { start } from "workflow/api";

import {
  registerCompanyWorkflow,
  resumeRegistrationApprovalHook,
  resumeRegistrationInvitationHook,
} from "@/workflows/register-company";

import { isRegistrationWorkflowHookPayloadValidationError } from "./workflow-hook-validation";
import { registrationWorkflowLayerFrom } from "./workflow-runtime-api";

export type { RegistrationWorkflowAdapters } from "./workflow-runtime-api";
export { registrationWorkflowLayerFrom } from "./workflow-runtime-api";

export const registrationWorkflowLayer = registrationWorkflowLayerFrom({
  isHookPayloadValidationError:
    isRegistrationWorkflowHookPayloadValidationError,
  resumeApproval: resumeRegistrationApprovalHook,
  resumeInvitation: resumeRegistrationInvitationHook,
  start: async (registrationId) =>
    await start(registerCompanyWorkflow, [
      { registrationId: String(registrationId) },
    ]),
});

const registrationWorkflowRuntime = ManagedRuntime.make(
  registrationWorkflowLayer
);

export const resumeRegistrationInvitation = async (input: {
  readonly event: RegistrationInvitationEvent;
  readonly invitationId: InvitationId;
}): Promise<void> => {
  await registrationWorkflowRuntime.runPromise(
    RegistrationWorkflow.pipe(
      Effect.flatMap((workflow) =>
        workflow.resumeInvitation(input.invitationId, input.event)
      )
    )
  );
};
