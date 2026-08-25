/* oxlint-disable eslint/max-classes-per-file, typescript/no-unsafe-call, unicorn/throw-new-error -- This commerce-facing port keeps the small request and failure vocabulary needed by the customer-account boundary; provider-owned invitation intent remains in Registration. */
import type {
  InvitationConflict,
  InvitationIssueOutcomeUnknown,
  InvitationProviderFailure,
} from "@repo/auth-contract/invitations";
import type { Effect, Redacted } from "effect";
import { Context, Schema } from "effect";

import {
  CompanyRoles,
  CommerceBusinessUnitId,
} from "../domain/commerce-account";
import { AuthUserId } from "../domain/commerce-request-context";

export const CustomerAccountInvitationId = Schema.NonEmptyString.pipe(
  Schema.brand("InvitationId")
);
export type CustomerAccountInvitationId =
  typeof CustomerAccountInvitationId.Type;

export class CustomerAccountCompanyActor extends Schema.Class<CustomerAccountCompanyActor>(
  "CustomerAccountCompanyActor"
)({
  authUserId: AuthUserId,
  businessUnitId: CommerceBusinessUnitId,
  email: Schema.Redacted(Schema.NonEmptyString, { label: "email" }),
  roles: CompanyRoles,
}) {}

export class CustomerAccountMemberInvitation extends Schema.Class<CustomerAccountMemberInvitation>(
  "CustomerAccountMemberInvitation"
)({
  expiresAt: Schema.Date,
  invitationId: CustomerAccountInvitationId,
  inviteeEmail: Schema.Redacted(Schema.NonEmptyString, { label: "email" }),
}) {}

/** Invitation-delivery failures keep one identity across provider, domain, and
 * application boundaries. */
export {
  InvitationConflict,
  InvitationIssueOutcomeUnknown,
  InvitationProviderFailure,
} from "@repo/auth-contract/invitations";

export class InvitationPolicyError extends Schema.TaggedError<InvitationPolicyError>()(
  "InvitationPolicyError",
  { message: Schema.String }
) {}

export class CustomerAccountProfileIncomplete extends Schema.TaggedError<CustomerAccountProfileIncomplete>()(
  "CustomerAccountProfileIncomplete",
  { message: Schema.String }
) {}

export type CustomerAccountMemberInvitationFailure =
  | InvitationConflict
  | InvitationIssueOutcomeUnknown
  | InvitationPolicyError
  | InvitationProviderFailure;

export interface InviteCustomerAccountMemberInput {
  readonly actor: CustomerAccountCompanyActor;
  readonly inviteeEmail: Redacted.Redacted;
  readonly roles: CompanyRoles;
}

/** A commerce-facing application port. Registration remains the owner of
 * Company Member Invitation intent and implements this port at composition. */
export class CustomerAccountMembers extends Context.Service<
  CustomerAccountMembers,
  {
    readonly invite: (
      input: InviteCustomerAccountMemberInput
    ) => Effect.Effect<
      CustomerAccountMemberInvitation,
      CustomerAccountMemberInvitationFailure
    >;
  }
>()("@repo/commerce/CustomerAccountMembers") {}
