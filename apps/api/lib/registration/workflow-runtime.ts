import { registrationQueriesLayer } from "@repo/commerce-provider/registration";
import {
  resumeRegistrationInvitationForInvitation as resumeRegistrationInvitationForInvitationProgram,
  resumeRegistrationInvitationForRegistration as resumeRegistrationInvitationForRegistrationProgram,
} from "@repo/registration";
import type {
  InvitationId,
  RegistrationId,
} from "@repo/registration/domain/identity";
import type { RegistrationInvitationEvent } from "@repo/registration/services/registration-workflow";
import { Layer, ManagedRuntime } from "effect";
import { start } from "workflow/api";

import {
  registerCompanyWorkflow,
  resumeRegistrationApprovalHook,
  resumeRegistrationInvitationHook,
} from "@/workflows/register-company";

import {
  REGISTRATION_CONTAINER,
  registrationRepositoryLayer,
} from "./repository-runtime";
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

const registrationInvitationRuntime = ManagedRuntime.make(
  Layer.mergeAll(
    registrationWorkflowLayer,
    registrationRepositoryLayer,
    registrationQueriesLayer({ container: REGISTRATION_CONTAINER })
  )
);

export const resumeRegistrationInvitation = async (input: {
  readonly event: RegistrationInvitationEvent;
  readonly invitationId: InvitationId;
}): Promise<void> => {
  await registrationInvitationRuntime.runPromise(
    resumeRegistrationInvitationForInvitationProgram(input)
  );
};

export const resumeRegistrationInvitationForRegistration = async (input: {
  readonly event: RegistrationInvitationEvent;
  readonly registrationId: RegistrationId;
}): Promise<void> => {
  await registrationInvitationRuntime.runPromise(
    resumeRegistrationInvitationForRegistrationProgram(input)
  );
};
