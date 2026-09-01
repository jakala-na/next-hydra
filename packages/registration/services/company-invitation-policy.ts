/* oxlint-disable max-classes-per-file, unicorn/throw-new-error -- The policy service and its Registration-owned typed failure form one cohesive domain capability; Effect Schema tagged-error construction is not recognized by the lint analyzer. */
import { Context, Effect, Layer, Redacted, Schema } from "effect";

import type { CompanyActor } from "../domain/actors";
import type { CommerceBusinessUnitId, RedactedEmail } from "../domain/identity";
import type { CompanyMemberIntent } from "../domain/invitations";
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

export interface AuthorizeRevokeInviteInput {
  readonly actor: CompanyActor;
  readonly intent: CompanyMemberIntent;
}

export interface AuthorizeManageCompanyInput {
  readonly actor: CompanyActor;
  readonly businessUnitId: CommerceBusinessUnitId;
}

const requireAdministrator = (actor: CompanyActor, message: string) =>
  hasCompanyRole(actor.roles, "admin")
    ? Effect.void
    : Effect.fail(
        new InvitationPolicyError({
          message,
        })
      );

export class CompanyInvitationPolicy extends Context.Service<
  CompanyInvitationPolicy,
  {
    readonly authorizeIssueInvite: (
      input: AuthorizeIssueInviteInput
    ) => Effect.Effect<void, InvitationConflict | InvitationPolicyError>;
    readonly authorizeRevokeInvite: (
      input: AuthorizeRevokeInviteInput
    ) => Effect.Effect<void, InvitationPolicyError>;
    readonly authorizeManageCompany: (
      input: AuthorizeManageCompanyInput
    ) => Effect.Effect<void, InvitationPolicyError>;
  }
>()("@repo/registration/CompanyInvitationPolicy") {
  static readonly layer = Layer.succeed(CompanyInvitationPolicy, {
    authorizeIssueInvite: (input) => {
      const issuerEmail = Redacted.value(input.actor.email)
        .trim()
        .toLowerCase();
      const inviteeEmail = Redacted.value(input.inviteeEmail)
        .trim()
        .toLowerCase();

      return requireAdministrator(
        input.actor,
        "Only company administrators can issue invitations"
      ).pipe(
        Effect.andThen(
          issuerEmail === inviteeEmail
            ? Effect.fail(
                new InvitationConflict({
                  message:
                    "A company administrator cannot invite their own email address",
                })
              )
            : Effect.void
        )
      );
    },
    authorizeManageCompany: (input) =>
      requireAdministrator(
        input.actor,
        "Only company administrators can manage company members"
      ).pipe(
        Effect.andThen(
          input.actor.businessUnitId === input.businessUnitId
            ? Effect.void
            : Effect.fail(
                new InvitationPolicyError({
                  message:
                    "Company administrators can manage only their own business unit",
                })
              )
        )
      ),
    authorizeRevokeInvite: (input) =>
      requireAdministrator(
        input.actor,
        "Only company administrators can revoke invitations"
      ).pipe(
        Effect.andThen(
          input.actor.businessUnitId === input.intent.businessUnitId
            ? Effect.void
            : Effect.fail(
                new InvitationPolicyError({
                  message:
                    "Company administrators can manage invitations only for their own business unit",
                })
              )
        )
      ),
  });
}
