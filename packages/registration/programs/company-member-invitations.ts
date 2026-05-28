import {
  type CommerceAccountError,
  CommerceAccounts,
} from "@repo/commerce/services/commerce-accounts";
import { Effect } from "effect";
import type { CompanyActor } from "../domain/actors";
import type {
  AcceptedAuthIdentity,
  InvitationId,
  RedactedEmail,
} from "../domain/identity";
import {
  type AcceptedInvitation,
  CompanyMemberIntent,
  type PendingInvitation,
  type RevokedInvitation,
} from "../domain/invitations";
import type { CompanyMemberInvitationRole } from "../domain/roles";
import {
  CompanyInvitationPolicy,
  type InvitationPolicyError,
} from "../services/company-invitation-policy";
import {
  type InvitationAcceptError,
  InvitationConflict,
  type InvitationIssueError,
  type InvitationRevokeError,
  Invitations,
} from "../services/invitations";

export interface IssueCompanyMemberInviteInput {
  readonly actor: CompanyActor;
  readonly inviteeEmail: RedactedEmail;
  readonly role: CompanyMemberInvitationRole;
}

export interface RevokeCompanyMemberInviteInput {
  readonly actor: CompanyActor;
  readonly invitationId: InvitationId;
}

export interface AcceptCompanyMemberInvitationInput {
  readonly invitationId: InvitationId;
  readonly acceptedIdentity: AcceptedAuthIdentity;
}

export const issueCompanyMemberInvite = (
  input: IssueCompanyMemberInviteInput
): Effect.Effect<
  PendingInvitation,
  InvitationPolicyError | InvitationIssueError,
  CompanyInvitationPolicy | Invitations
> =>
  Effect.gen(function* () {
    const policy = yield* CompanyInvitationPolicy;
    const invitations = yield* Invitations;

    yield* policy.authorizeIssueInvite({
      actor: input.actor,
      inviteeEmail: input.inviteeEmail,
      role: input.role,
    });

    return yield* invitations.issue({
      intent: new CompanyMemberIntent({
        intent: "company_member",
        businessUnitId: input.actor.businessUnitId,
        inviteeEmail: input.inviteeEmail,
        role: "associate",
      }),
      issuedBy: input.actor,
    });
  });

export const revokeCompanyMemberInvite = (
  input: RevokeCompanyMemberInviteInput
): Effect.Effect<
  RevokedInvitation,
  InvitationPolicyError | InvitationRevokeError,
  CompanyInvitationPolicy | Invitations
> =>
  Effect.gen(function* () {
    const policy = yield* CompanyInvitationPolicy;
    const invitations = yield* Invitations;

    yield* policy.authorizeRevokeInvite({ actor: input.actor });

    return yield* invitations.revoke({
      invitationId: input.invitationId,
      revokedBy: input.actor,
    });
  });

export const acceptCompanyMemberInvitation = (
  input: AcceptCompanyMemberInvitationInput
): Effect.Effect<
  AcceptedInvitation,
  InvitationAcceptError | CommerceAccountError,
  Invitations | CommerceAccounts
> =>
  Effect.gen(function* () {
    const invitations = yield* Invitations;
    const commerceAccounts = yield* CommerceAccounts;

    const invitation = yield* invitations.accept({
      invitationId: input.invitationId,
      acceptedIdentity: input.acceptedIdentity,
      expectedIntent: "company_member",
    });

    if (invitation.intent.intent !== "company_member") {
      return yield* new InvitationConflict({
        message: "Invitation is not for company membership",
      });
    }

    if (invitation.intent.role !== "associate") {
      return yield* new InvitationConflict({
        message: "Company member invitations can only grant associate access",
      });
    }

    yield* commerceAccounts.addAssociate({
      businessUnitId: invitation.intent.businessUnitId,
      acceptedIdentity: input.acceptedIdentity,
      role: invitation.intent.role,
    });

    return invitation;
  });
