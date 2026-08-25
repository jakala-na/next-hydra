/* oxlint-disable max-classes-per-file, unicorn/throw-new-error -- The policy service and its Registration-owned typed failure form one cohesive domain capability; Effect Schema tagged-error construction is not recognized by the lint analyzer. */
import { Context, Effect, Layer, Redacted, Schema } from "effect";

import type { CompanyActor } from "../domain/actors";
import type { RedactedEmail } from "../domain/identity";
import type { CompanyRoles } from "../domain/roles";
import { hasCompanyRole } from "../domain/roles";
import { InvitationConflict } from "./invitations";

export class InvitationPolicyError extends Schema.TaggedError<InvitationPolicyError>()(
  "InvitationPolicyError",
  { message: Schema.String }
) {}

export interface AuthorizeIssueInviteInput {
  readonly actor: CompanyActor;
  readonly inviteeEmail: RedactedEmail;
  readonly roles: CompanyRoles;
}

export class CompanyInvitationPolicy extends Context.Service<
  CompanyInvitationPolicy,
  {
    readonly authorizeIssueInvite: (
      input: AuthorizeIssueInviteInput
    ) => Effect.Effect<void, InvitationConflict | InvitationPolicyError>;
  }
>()("@repo/registration/CompanyInvitationPolicy") {
  static readonly layer = Layer.succeed(CompanyInvitationPolicy, {
    authorizeIssueInvite: (input) => {
      if (!hasCompanyRole(input.actor.roles, "admin")) {
        return Effect.fail(
          new InvitationPolicyError({
            message: "Only company administrators can issue invitations",
          })
        );
      }

      const issuerEmail = Redacted.value(input.actor.email)
        .trim()
        .toLowerCase();
      const inviteeEmail = Redacted.value(input.inviteeEmail)
        .trim()
        .toLowerCase();

      return issuerEmail === inviteeEmail
        ? Effect.fail(
            new InvitationConflict({
              message:
                "A company administrator cannot invite their own email address",
            })
          )
        : Effect.void;
    },
  });
}
