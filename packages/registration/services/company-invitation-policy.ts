import { Context, Effect, Layer, Schema } from "effect";

import type { CompanyActor } from "../domain/actors";
import type { RedactedEmail } from "../domain/identity";
import type { CompanyMemberInvitationRole } from "../domain/roles";

export class InvitationPolicyError extends Schema.TaggedErrorClass<InvitationPolicyError>()(
  "InvitationPolicyError",
  {
    message: Schema.String,
  }
) {}

export interface AuthorizeIssueInviteInput {
  readonly actor: CompanyActor;
  readonly inviteeEmail: RedactedEmail;
  readonly role: CompanyMemberInvitationRole;
}

export interface AuthorizeRevokeInviteInput {
  readonly actor: CompanyActor;
}

export class CompanyInvitationPolicy extends Context.Service<
  CompanyInvitationPolicy,
  {
    readonly authorizeIssueInvite: (
      input: AuthorizeIssueInviteInput
    ) => Effect.Effect<void, InvitationPolicyError>;
    readonly authorizeRevokeInvite: (
      input: AuthorizeRevokeInviteInput
    ) => Effect.Effect<void, InvitationPolicyError>;
  }
>()("@repo/registration/CompanyInvitationPolicy") {
  static readonly layer = Layer.succeed(CompanyInvitationPolicy, {
    authorizeIssueInvite: (input) =>
      input.actor.role === "owner" && input.role === "associate"
        ? Effect.void
        : Effect.fail(
            new InvitationPolicyError({
              message: "Only company owners can issue associate invitations",
            })
          ),
    authorizeRevokeInvite: (input) =>
      input.actor.role === "owner"
        ? Effect.void
        : Effect.fail(
            new InvitationPolicyError({
              message: "Only company owners can revoke invitations",
            })
          ),
  });
}
