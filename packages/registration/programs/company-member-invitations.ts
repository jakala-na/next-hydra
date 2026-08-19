import { CommerceAccounts } from "@repo/commerce/services/commerce-accounts";
import type { CommerceAccountUnavailable } from "@repo/commerce/services/commerce-accounts";
import { Effect } from "effect";

import type { CompanyActor } from "../domain/actors";
import type {
  AcceptedAuthIdentity,
  InvitationId,
  RedactedEmail,
} from "../domain/identity";
import { CompanyMemberIntent } from "../domain/invitations";
import type {
  AcceptedInvitation,
  PendingInvitation,
  RevokedInvitation,
} from "../domain/invitations";
import type { CompanyMemberInvitationRole } from "../domain/roles";
import { CompanyInvitationPolicy } from "../services/company-invitation-policy";
import type { InvitationPolicyError } from "../services/company-invitation-policy";
import { InvitationConflict, Invitations } from "../services/invitations";
import type {
  InvitationAcceptError,
  InvitationIssueError,
  InvitationRevokeError,
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
        businessUnitId: input.actor.businessUnitId,
        intent: "company_member",
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
  InvitationAcceptError | CommerceAccountUnavailable,
  Invitations | CommerceAccounts
> =>
  Effect.gen(function* () {
    const invitations = yield* Invitations;
    const commerceAccounts = yield* CommerceAccounts;

    const invitation = yield* invitations.accept({
      acceptedIdentity: input.acceptedIdentity,
      expectedIntent: "company_member",
      invitationId: input.invitationId,
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
      acceptedIdentity: input.acceptedIdentity,
      businessUnitId: invitation.intent.businessUnitId,
      role: invitation.intent.role,
    });

    return invitation;
  });
