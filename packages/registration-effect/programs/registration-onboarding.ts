import { Clock, Effect } from "effect";
import type { RegistrationReviewerActor } from "../domain/actors";
import { registrationSystemActor } from "../domain/actors";
import { ApprovedDecision, RejectedDecision } from "../domain/approval";
import type {
  AcceptedAuthIdentity,
  InvitationId,
  RegistrationId,
} from "../domain/identity";
import { ProviderInvitationIntent } from "../domain/invitations";
import type {
  ApprovedRegistration,
  RejectedRegistration,
} from "../domain/registration";
import {
  type CommerceAccountError,
  CommerceAccounts,
} from "../services/commerce-account";
import {
  type InvitationAcceptError,
  type InvitationIssueError,
  Invitations,
} from "../services/invitations";
import {
  type RegistrationFindByInvitationError,
  Registrations,
  type RegistrationTransitionError,
} from "../services/registrations";

const nowDate = Clock.currentTimeMillis.pipe(
  Effect.map((time) => new Date(time))
);

export interface ApproveRegistrationInput {
  readonly registrationId: RegistrationId;
  readonly actor: RegistrationReviewerActor;
  readonly reason?: string;
}

export interface RejectRegistrationInput {
  readonly registrationId: RegistrationId;
  readonly actor: RegistrationReviewerActor;
  readonly reason?: string;
}

export interface AcceptRegistrationInvitationInput {
  readonly invitationId: InvitationId;
  readonly acceptedIdentity: AcceptedAuthIdentity;
}

export const approveRegistration = (
  input: ApproveRegistrationInput
): Effect.Effect<
  ApprovedRegistration,
  RegistrationTransitionError | CommerceAccountError | InvitationIssueError,
  Registrations | CommerceAccounts | Invitations
> =>
  Effect.gen(function* () {
    const registrations = yield* Registrations;
    const commerceAccounts = yield* CommerceAccounts;
    const invitations = yield* Invitations;

    const registration = yield* registrations.get(input.registrationId);

    if (registration._tag === "ApprovedRegistration") {
      return registration;
    }

    const decidedAt = yield* nowDate;
    const decision = new ApprovedDecision({
      decision: "approved",
      actor: input.actor,
      reason: input.reason,
      decidedAt,
    });

    const commerceAccount =
      yield* commerceAccounts.createFromRegistration(registration);
    const intent = new ProviderInvitationIntent({
      intent: "provider_managed",
      inviteeEmail: registration.details.email,
      role: "owner",
    });
    const invitation = yield* invitations.issue({
      intent,
      issuedBy: registrationSystemActor,
    });

    return yield* registrations.markApproved({
      registrationId: input.registrationId,
      decision,
      commerceAccount,
      invitationId: invitation.id,
    });
  });

export const rejectRegistration = (
  input: RejectRegistrationInput
): Effect.Effect<
  RejectedRegistration,
  RegistrationTransitionError,
  Registrations
> =>
  Effect.gen(function* () {
    const registrations = yield* Registrations;
    const registration = yield* registrations.get(input.registrationId);

    if (registration._tag === "RejectedRegistration") {
      return registration;
    }

    const decidedAt = yield* nowDate;
    const decision = new RejectedDecision({
      decision: "rejected",
      actor: input.actor,
      reason: input.reason,
      decidedAt,
    });

    return yield* registrations.markRejected({
      registrationId: input.registrationId,
      decision,
    });
  });

export const acceptRegistrationInvitation = (
  input: AcceptRegistrationInvitationInput
): Effect.Effect<
  ApprovedRegistration,
  | InvitationAcceptError
  | CommerceAccountError
  | RegistrationFindByInvitationError,
  Invitations | CommerceAccounts | Registrations
> =>
  Effect.gen(function* () {
    const invitations = yield* Invitations;
    const commerceAccounts = yield* CommerceAccounts;
    const registrations = yield* Registrations;

    const registration = yield* registrations.findByInvitationId(
      input.invitationId
    );

    yield* invitations.accept({
      invitationId: input.invitationId,
      acceptedIdentity: input.acceptedIdentity,
      expectedIntent: "provider_managed",
    });

    yield* commerceAccounts.linkRegistrantIdentity({
      registration,
      acceptedIdentity: input.acceptedIdentity,
    });

    return registration;
  });
