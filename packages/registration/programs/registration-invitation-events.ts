import { Effect } from "effect";

import type { RegistrationId } from "../domain/identity";
import type { RegistrationInvitationEvent } from "../services/registration-workflow";
import { RegistrationWorkflow } from "../services/registration-workflow";
import { Registrations } from "../services/registrations";

export interface ResumeRegistrationInvitationForRegistrationInput {
  readonly event: RegistrationInvitationEvent;
  readonly registrationId: RegistrationId;
}

export const resumeRegistrationInvitationForRegistration = Effect.fn(
  "resumeRegistrationInvitationForRegistration"
)(function* (input: ResumeRegistrationInvitationForRegistrationInput) {
  const registrations = yield* Registrations;
  const registration = yield* registrations.get(input.registrationId);

  if (registration._tag !== "ApprovedRegistration") {
    return yield* Effect.die(
      new Error(`Registration ${input.registrationId} has no issued invitation`)
    );
  }

  const workflow = yield* RegistrationWorkflow;
  return yield* workflow.resumeInvitation(
    registration.invitationId,
    input.event
  );
});
