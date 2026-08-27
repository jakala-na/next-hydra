import type { IdentityMembershipProjectionFailure } from "@repo/auth-contract/identity-memberships";
import { CommerceAccounts } from "@repo/commerce/services/commerce-accounts";
import type { CommerceAccountUnavailable } from "@repo/commerce/services/commerce-accounts";
import { Clock, Effect } from "effect";

import type { RegistrationReviewerActor } from "../domain/actors";
import { registrationSystemActor } from "../domain/actors";
import { ApprovedDecision, RejectedDecision } from "../domain/approval";
import { AcceptedAuthIdentity } from "../domain/identity";
import type { InvitationId, RegistrationId } from "../domain/identity";
import { RegistrationApprovalIntent } from "../domain/invitations";
import type { RevokedInvitation } from "../domain/invitations";
import type {
  ApprovedRegistration,
  RejectedRegistration,
} from "../domain/registration";
import { INITIAL_COMPANY_ROLES } from "../domain/roles";
import { CompanyMemberIdentityProjection } from "../services/company-member-identity-projection";
import { IdentityUsers } from "../services/identity-users";
import type {
  IdentityUserLookupFailure,
  IdentityUserNotFound,
} from "../services/identity-users";
import {
  InvitationConflict,
  RegistrationInvitations,
} from "../services/invitations";
import type {
  InvitationAcceptError,
  InvitationIssueError,
  InvitationRevokeError,
} from "../services/invitations";
import { RegistrationNotFoundByInvitationId } from "../services/registration-queries";
import { RegistrationWorkflow } from "../services/registration-workflow";
import type { RegistrationWorkflowInvitationResumeOutcomeUnknown } from "../services/registration-workflow";
import { Registrations } from "../services/registrations";
import type {
  RegistrationDecisionTransitionError,
  RegistrationOnboardingTransitionError,
  RegistrationReadError,
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
  readonly registrationId: RegistrationId;
  readonly invitationId: InvitationId;
  readonly acceptedIdentity: AcceptedAuthIdentity;
}

export interface RevokeRegistrationInvitationInput {
  readonly actor: RegistrationReviewerActor;
  readonly registrationId: RegistrationId;
}

export interface ExpireRegistrationInvitationInput {
  readonly registrationId: RegistrationId;
  readonly invitationId: InvitationId;
}

export interface RecordRegistrationInvitationRevokedInput {
  readonly registrationId: RegistrationId;
  readonly invitationId: InvitationId;
}

export const approveRegistration = (
  input: ApproveRegistrationInput
): Effect.Effect<
  ApprovedRegistration,
  | CommerceAccountUnavailable
  | IdentityMembershipProjectionFailure
  | IdentityUserLookupFailure
  | IdentityUserNotFound
  | RegistrationDecisionTransitionError
  | InvitationIssueError,
  | CommerceAccounts
  | CompanyMemberIdentityProjection
  | IdentityUsers
  | Registrations
  | RegistrationInvitations
> =>
  Effect.gen(function* () {
    const registrations = yield* Registrations;
    const invitations = yield* RegistrationInvitations;
    const commerceAccounts = yield* CommerceAccounts;
    const identityProjection = yield* CompanyMemberIdentityProjection;
    const identityUsers = yield* IdentityUsers;

    const registration = yield* registrations.get(input.registrationId);

    if (registration._tag === "ApprovedRegistration") {
      if (
        registration.submittedByAuthUserId !== undefined &&
        registration.onboardingStatus === "accepted" &&
        registration.invitationId === undefined
      ) {
        const identity = yield* identityUsers.getById(
          registration.submittedByAuthUserId
        );
        const acceptedIdentity = new AcceptedAuthIdentity({
          authUserId: identity.authUserId,
          email: identity.email,
          firstName:
            identity.firstName ?? registration.details.contactFirstName,
          lastName: identity.lastName ?? registration.details.contactLastName,
        });
        const commerceAccount =
          yield* commerceAccounts.createFromRegistration(registration);
        yield* commerceAccounts.linkRegistrantIdentity({
          acceptedIdentity,
          commerceAccount,
        });
        yield* identityProjection.projectMembership({
          authUserId: acceptedIdentity.authUserId,
          businessUnitId: commerceAccount.businessUnitId,
          roles: INITIAL_COMPANY_ROLES,
        });
      }
      return registration;
    }

    const decidedAt = yield* nowDate;
    const decision = new ApprovedDecision({
      actor: input.actor,
      decidedAt,
      decision: "approved",
      reason: input.reason,
    });

    if (registration.submittedByAuthUserId !== undefined) {
      const identity = yield* identityUsers.getById(
        registration.submittedByAuthUserId
      );
      const approved = yield* registrations.markApproved({
        acceptedAuthUserId: identity.authUserId,
        decision,
        registrationId: input.registrationId,
      });
      const commerceAccount =
        yield* commerceAccounts.createFromRegistration(approved);
      const acceptedIdentity = new AcceptedAuthIdentity({
        authUserId: identity.authUserId,
        email: identity.email,
        firstName: identity.firstName ?? approved.details.contactFirstName,
        lastName: identity.lastName ?? approved.details.contactLastName,
      });
      yield* commerceAccounts.linkRegistrantIdentity({
        acceptedIdentity,
        commerceAccount,
      });
      yield* identityProjection.projectMembership({
        authUserId: acceptedIdentity.authUserId,
        businessUnitId: commerceAccount.businessUnitId,
        roles: INITIAL_COMPANY_ROLES,
      });

      return approved;
    }

    const intent = new RegistrationApprovalIntent({
      intent: "registration_approval",
      inviteeEmail: registration.details.email,
      registrationId: registration.id,
      roles: INITIAL_COMPANY_ROLES,
    });
    const invitation = yield* invitations.issue({
      intent,
      issuedBy: registrationSystemActor,
    });

    return yield* registrations.markApproved({
      decision,
      invitationId: invitation.id,
      registrationId: input.registrationId,
    });
  });

export const rejectRegistration = (
  input: RejectRegistrationInput
): Effect.Effect<
  RejectedRegistration,
  RegistrationDecisionTransitionError,
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
      actor: input.actor,
      decidedAt,
      decision: "rejected",
      reason: input.reason,
    });

    return yield* registrations.markRejected({
      decision,
      registrationId: input.registrationId,
    });
  });

export const acceptRegistrationInvitation = (
  input: AcceptRegistrationInvitationInput
): Effect.Effect<
  ApprovedRegistration,
  | InvitationAcceptError
  | CommerceAccountUnavailable
  | IdentityMembershipProjectionFailure
  | RegistrationReadError
  | RegistrationOnboardingTransitionError
  | RegistrationNotFoundByInvitationId,
  | RegistrationInvitations
  | CommerceAccounts
  | CompanyMemberIdentityProjection
  | Registrations
> =>
  Effect.gen(function* () {
    const invitations = yield* RegistrationInvitations;
    const commerceAccounts = yield* CommerceAccounts;
    const identityProjection = yield* CompanyMemberIdentityProjection;
    const registrations = yield* Registrations;

    const registration = yield* registrations.get(input.registrationId).pipe(
      Effect.flatMap((candidate) =>
        candidate._tag === "ApprovedRegistration" &&
        candidate.invitationId === input.invitationId
          ? Effect.succeed(candidate)
          : Effect.fail(
              new RegistrationNotFoundByInvitationId({
                invitationId: input.invitationId,
                message: `Registration for invitation ${input.invitationId} was not found`,
              })
            )
      )
    );

    yield* invitations.accept({
      acceptedIdentity: input.acceptedIdentity,
      intent: new RegistrationApprovalIntent({
        intent: "registration_approval",
        inviteeEmail: registration.details.email,
        registrationId: registration.id,
        roles: INITIAL_COMPANY_ROLES,
      }),
      invitationId: input.invitationId,
      issuedBy: registrationSystemActor,
    });

    const acceptedRegistration = yield* registrations.markOnboardingStatus({
      acceptedAuthUserId: input.acceptedIdentity.authUserId,
      registrationId: registration.id,
      status: "accepted",
    });

    const commerceAccount =
      yield* commerceAccounts.createFromRegistration(acceptedRegistration);

    yield* commerceAccounts.linkRegistrantIdentity({
      acceptedIdentity: input.acceptedIdentity,
      commerceAccount,
    });
    yield* identityProjection.projectMembership({
      authUserId: input.acceptedIdentity.authUserId,
      businessUnitId: commerceAccount.businessUnitId,
      roles: INITIAL_COMPANY_ROLES,
    });

    return acceptedRegistration;
  });

export const expireRegistrationInvitation = (
  input: ExpireRegistrationInvitationInput
): Effect.Effect<
  ApprovedRegistration,
  RegistrationOnboardingTransitionError | RegistrationNotFoundByInvitationId,
  Registrations
> =>
  Effect.gen(function* () {
    const registrations = yield* Registrations;
    const registration = yield* registrations.get(input.registrationId);

    if (
      registration._tag !== "ApprovedRegistration" ||
      registration.invitationId !== input.invitationId
    ) {
      return yield* new RegistrationNotFoundByInvitationId({
        invitationId: input.invitationId,
        message: `Registration for invitation ${input.invitationId} was not found`,
      });
    }

    const expiredRegistration = yield* registrations.markOnboardingStatus({
      registrationId: registration.id,
      status: "expired",
    });

    return expiredRegistration;
  });

export const recordRegistrationInvitationRevoked = (
  input: RecordRegistrationInvitationRevokedInput
): Effect.Effect<
  ApprovedRegistration,
  RegistrationOnboardingTransitionError | RegistrationNotFoundByInvitationId,
  Registrations
> =>
  Effect.gen(function* () {
    const registrations = yield* Registrations;
    const registration = yield* registrations.get(input.registrationId);

    if (
      registration._tag !== "ApprovedRegistration" ||
      registration.invitationId !== input.invitationId
    ) {
      return yield* new RegistrationNotFoundByInvitationId({
        invitationId: input.invitationId,
        message: `Registration for invitation ${input.invitationId} was not found`,
      });
    }

    const revokedRegistration = yield* registrations.markOnboardingStatus({
      registrationId: registration.id,
      status: "revoked",
    });

    return revokedRegistration;
  });

export const revokeRegistrationInvitation = (
  input: RevokeRegistrationInvitationInput
): Effect.Effect<
  RevokedInvitation,
  | InvitationRevokeError
  | RegistrationReadError
  | RegistrationOnboardingTransitionError
  | RegistrationWorkflowInvitationResumeOutcomeUnknown,
  RegistrationInvitations | RegistrationWorkflow | Registrations
> =>
  Effect.gen(function* () {
    const invitations = yield* RegistrationInvitations;
    const registrations = yield* Registrations;
    const registration = yield* registrations.get(input.registrationId);

    if (
      registration._tag !== "ApprovedRegistration" ||
      registration.invitationId === undefined
    ) {
      return yield* new InvitationConflict({
        message: `Registration ${input.registrationId} has no invitation to revoke`,
      });
    }

    const revoked = yield* invitations.revoke({
      intent: new RegistrationApprovalIntent({
        intent: "registration_approval",
        inviteeEmail: registration.details.email,
        registrationId: registration.id,
        roles: INITIAL_COMPANY_ROLES,
      }),
      invitationId: registration.invitationId,
      issuedBy: registrationSystemActor,
      revokedBy: input.actor,
    });

    yield* registrations.markOnboardingStatus({
      registrationId: registration.id,
      status: "revoked",
    });

    const workflow = yield* RegistrationWorkflow;
    yield* workflow.resumeInvitation(revoked.id, { event: "revoked" });

    return revoked;
  });
