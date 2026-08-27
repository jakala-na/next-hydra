import { Effect } from "effect";

import type { InvitationId, RegistrationId } from "../domain/identity";
import type { ApprovedRegistration } from "../domain/registration";
import { RegistrationQueries } from "../services/registration-queries";
import type { RegistrationInvitationEvent } from "../services/registration-workflow";
import { RegistrationWorkflow } from "../services/registration-workflow";
import { Registrations } from "../services/registrations";

export interface ResumeRegistrationInvitationForRegistrationInput {
  readonly event: RegistrationInvitationEvent;
  readonly registrationId: RegistrationId;
}

export interface ResumeRegistrationInvitationForInvitationInput {
  readonly event: RegistrationInvitationEvent;
  readonly invitationId: InvitationId;
}

const resumeApprovedRegistrationInvitation = Effect.fn(
  "resumeApprovedRegistrationInvitation"
)(function* (
  registration: ApprovedRegistration,
  event: RegistrationInvitationEvent
) {
  const registrations = yield* Registrations;

  if (event.event === "revoked") {
    yield* registrations.markOnboardingStatus({
      registrationId: registration.id,
      status: "revoked",
    });
  }

  if (
    event.event === "accepted" &&
    registration.onboardingStatus === "accepted"
  ) {
    yield* registrations.markOnboardingStatus({
      acceptedAuthUserId: event.acceptedIdentity.authUserId,
      registrationId: registration.id,
      status: "accepted",
    });
  } else {
    const workflow = yield* RegistrationWorkflow;
    const { invitationId } = registration;
    yield* invitationId === undefined
      ? Effect.die(
          new Error(`Registration ${registration.id} has no issued invitation`)
        )
      : workflow.resumeInvitation(invitationId, event);
  }
});

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

  return yield* resumeApprovedRegistrationInvitation(registration, input.event);
});

export const resumeRegistrationInvitationForInvitation = Effect.fn(
  "resumeRegistrationInvitationForInvitation"
)(function* (input: ResumeRegistrationInvitationForInvitationInput) {
  const queries = yield* RegistrationQueries;
  const registration = yield* queries.findByInvitationId(input.invitationId);

  return yield* resumeApprovedRegistrationInvitation(registration, input.event);
});
