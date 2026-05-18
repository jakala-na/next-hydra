import { Clock, Effect } from "effect";
import type { RegistrationReviewerActor } from "../domain/actors";
import { registrationSystemActor } from "../domain/actors";
import { ApprovedDecision, RejectedDecision } from "../domain/approval";
import type {
  AcceptedAuthIdentity,
  InvitationId,
  RegistrationId,
} from "../domain/identity";
import {
  PendingRegistrationInvitation,
  RegistrationApprovalIntent,
} from "../domain/invitations";
import type {
  ApprovedRegistration,
  Registration,
  RejectedRegistration,
} from "../domain/registration";
import {
  type CommerceAccountError,
  CommerceAccounts,
} from "../services/commerce-account";
import {
  type InvitationAcceptError,
  InvitationConflict,
  type InvitationIssueError,
  Invitations,
} from "../services/invitations";
import {
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
    const intent = new RegistrationApprovalIntent({
      intent: "registration_approval",
      registrationId: registration.id,
      inviteeEmail: registration.details.email,
      role: "owner",
    });
    const invitation = yield* invitations.issue({
      intent,
      issuedBy: registrationSystemActor,
    });
    const registrationInvitation = new PendingRegistrationInvitation({
      _tag: "PendingInvitation",
      id: invitation.id,
      intent,
      issuedBy: invitation.issuedBy,
      createdAt: invitation.createdAt,
    });

    return yield* registrations.markApproved({
      registrationId: input.registrationId,
      decision,
      commerceAccount,
      invitation: registrationInvitation,
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
  Registration,
  InvitationAcceptError | CommerceAccountError | RegistrationTransitionError,
  Invitations | CommerceAccounts | Registrations
> =>
  Effect.gen(function* () {
    const invitations = yield* Invitations;
    const commerceAccounts = yield* CommerceAccounts;
    const registrations = yield* Registrations;

    const invitation = yield* invitations.accept({
      invitationId: input.invitationId,
      acceptedIdentity: input.acceptedIdentity,
      expectedIntent: "registration_approval",
    });

    if (invitation.intent.intent !== "registration_approval") {
      return yield* new InvitationConflict({
        reason: "Invitation is not for registration approval",
      });
    }

    yield* commerceAccounts.linkRegistrantIdentity({
      invitation,
      acceptedIdentity: input.acceptedIdentity,
    });

    return yield* registrations.get(invitation.intent.registrationId);
  });
