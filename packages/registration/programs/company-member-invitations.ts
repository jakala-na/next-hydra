import { Effect } from "effect";

import type { CompanyActor } from "../domain/actors";
import type { RedactedEmail } from "../domain/identity";
import { CompanyMemberIntent } from "../domain/invitations";
import type { PendingInvitation } from "../domain/invitations";
import type { CompanyRoles } from "../domain/roles";
import { CompanyInvitationPolicy } from "../services/company-invitation-policy";
import type { InvitationPolicyError } from "../services/company-invitation-policy";
import { CompanyMemberInvitations } from "../services/invitations";
import type { CompanyMemberInvitationIssueError } from "../services/invitations";

export interface IssueCompanyMemberInviteInput {
  readonly actor: CompanyActor;
  readonly inviteeEmail: RedactedEmail;
  readonly roles: CompanyRoles;
}

export const issueCompanyMemberInvite = (
  input: IssueCompanyMemberInviteInput
): Effect.Effect<
  PendingInvitation,
  InvitationPolicyError | CompanyMemberInvitationIssueError,
  CompanyInvitationPolicy | CompanyMemberInvitations
> =>
  Effect.gen(function* () {
    const policy = yield* CompanyInvitationPolicy;
    const invitations = yield* CompanyMemberInvitations;

    yield* policy.authorizeIssueInvite({
      actor: input.actor,
      inviteeEmail: input.inviteeEmail,
      roles: input.roles,
    });

    return yield* invitations.issue({
      intent: new CompanyMemberIntent({
        businessUnitId: input.actor.businessUnitId,
        intent: "company_member",
        inviteeEmail: input.inviteeEmail,
        roles: input.roles,
      }),
      issuedBy: input.actor,
    });
  });
