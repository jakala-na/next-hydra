import { Effect, Schema } from "effect";

import type { CompanyActor } from "../domain/actors";
import { InvitationId } from "../domain/identity";
import type { AcceptedAuthIdentity, RedactedEmail } from "../domain/identity";
import { CompanyMemberIntent } from "../domain/invitations";
import type { PendingInvitation } from "../domain/invitations";
import type { CompanyMemberInvitationRole } from "../domain/roles";
import { CompanyInvitationPolicy } from "../services/company-invitation-policy";
import type { InvitationPolicyError } from "../services/company-invitation-policy";
import { CompanyMemberInvitations } from "../services/invitations";
import type { InvitationIssueError } from "../services/invitations";

export class CompanyMemberInvitationContextUnavailable extends Schema.TaggedError<CompanyMemberInvitationContextUnavailable>()(
  "CompanyMemberInvitationContextUnavailable",
  {
    invitationId: InvitationId,
    message: Schema.String,
    operation: Schema.Literals(["accept", "revoke"]),
  }
) {}

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
  readonly acceptedIdentity: AcceptedAuthIdentity;
  readonly invitationId: InvitationId;
}

export const issueCompanyMemberInvite = (
  input: IssueCompanyMemberInviteInput
): Effect.Effect<
  PendingInvitation,
  InvitationPolicyError | InvitationIssueError,
  CompanyInvitationPolicy | CompanyMemberInvitations
> =>
  Effect.gen(function* () {
    const policy = yield* CompanyInvitationPolicy;
    const invitations = yield* CompanyMemberInvitations;

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
  never,
  InvitationPolicyError | CompanyMemberInvitationContextUnavailable,
  CompanyInvitationPolicy
> =>
  Effect.gen(function* () {
    const policy = yield* CompanyInvitationPolicy;

    yield* policy.authorizeRevokeInvite({ actor: input.actor });

    return yield* new CompanyMemberInvitationContextUnavailable({
      invitationId: input.invitationId,
      message:
        "Company-member invitation revocation requires durable domain context",
      operation: "revoke",
    });
  });

export const acceptCompanyMemberInvitation = (
  input: AcceptCompanyMemberInvitationInput
): Effect.Effect<never, CompanyMemberInvitationContextUnavailable> =>
  Effect.fail(
    new CompanyMemberInvitationContextUnavailable({
      invitationId: input.invitationId,
      message:
        "Company-member invitation acceptance requires durable domain context",
      operation: "accept",
    })
  );
