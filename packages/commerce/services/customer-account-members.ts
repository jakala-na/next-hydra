/* oxlint-disable eslint/max-classes-per-file, typescript/no-unsafe-call, unicorn/throw-new-error -- This commerce-facing port keeps the small request and failure vocabulary needed by the customer-account boundary; provider-owned invitation intent remains in Registration. */
import type {
  CompanyMemberInvitationNotFound,
  CompanyMemberInvitationPersistenceFailure,
  CompanyMemberInvitationRecordConflict,
  InvitationConflict,
  InvitationExpired,
  InvitationIssueOutcomeUnknown,
  InvitationNotFound,
  InvitationProviderFailure,
} from "@repo/auth-contract/invitations";
import type { Effect, Redacted } from "effect";
import { Context, Schema } from "effect";

import {
  CompanyRoles,
  CommerceBusinessUnitId,
  CommerceCustomerId,
} from "../domain/commerce-account";
import { AuthUserId } from "../domain/commerce-request-context";
import type { CommerceAccountUnavailable } from "./commerce-accounts";

export const CustomerAccountInvitationId = Schema.NonEmptyString.pipe(
  Schema.brand("InvitationId")
);
export type CustomerAccountInvitationId =
  typeof CustomerAccountInvitationId.Type;

export const CustomerAccountCompanyMemberInvitationId =
  Schema.NonEmptyString.pipe(Schema.brand("CompanyMemberInvitationId"));
export type CustomerAccountCompanyMemberInvitationId =
  typeof CustomerAccountCompanyMemberInvitationId.Type;

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

export class CustomerAccountInvitationListItem extends Schema.Class<CustomerAccountInvitationListItem>(
  "CustomerAccountInvitationListItem"
)({
  acceptedAuthUserId: Schema.optional(AuthUserId),
  companyMemberInvitationId: CustomerAccountCompanyMemberInvitationId,
  expiresAt: Schema.Date,
  firstName: Schema.Redacted(Schema.NonEmptyString, { label: "personName" }),
  inviteeEmail: Schema.Redacted(Schema.NonEmptyString, { label: "email" }),
  lastName: Schema.Redacted(Schema.NonEmptyString, { label: "personName" }),
  roles: CompanyRoles,
  status: Schema.Literals(["pending", "accepted", "expired", "revoked"]),
}) {}

export class CustomerAccountMemberListItem extends Schema.Class<CustomerAccountMemberListItem>(
  "CustomerAccountMemberListItem"
)({
  authUserId: AuthUserId,
  canRemove: Schema.Boolean,
  customerId: CommerceCustomerId,
  email: Schema.Redacted(Schema.NonEmptyString, { label: "email" }),
  firstName: Schema.optional(
    Schema.Redacted(Schema.NonEmptyString, { label: "personName" })
  ),
  lastName: Schema.optional(
    Schema.Redacted(Schema.NonEmptyString, { label: "personName" })
  ),
  roles: CompanyRoles,
}) {}

export class CustomerAccountPeople extends Schema.Class<CustomerAccountPeople>(
  "CustomerAccountPeople"
)({
  invitations: Schema.Array(CustomerAccountInvitationListItem),
  members: Schema.Array(CustomerAccountMemberListItem),
}) {}

/** Invitation-delivery failures keep one identity across provider, domain, and
 * application boundaries. */
export {
  CompanyMemberInvitationNotFound,
  CompanyMemberInvitationPersistenceFailure,
  CompanyMemberInvitationRecordConflict,
  InvitationConflict,
  InvitationExpired,
  InvitationIssueOutcomeUnknown,
  InvitationNotFound,
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

export class CompanyMemberRemovalConflict extends Schema.TaggedError<CompanyMemberRemovalConflict>()(
  "CompanyMemberRemovalConflict",
  { message: Schema.String }
) {}

export class CompanyMemberManagementForbidden extends Schema.TaggedError<CompanyMemberManagementForbidden>()(
  "CompanyMemberManagementForbidden",
  { message: Schema.String }
) {}

export type InviteCustomerAccountMemberFailure =
  | CommerceAccountUnavailable
  | InvitationConflict
  | InvitationIssueOutcomeUnknown
  | InvitationPolicyError
  | InvitationProviderFailure;

export type ManageCustomerAccountInvitationFailure =
  | InviteCustomerAccountMemberFailure
  | CompanyMemberInvitationNotFound
  | CompanyMemberInvitationPersistenceFailure
  | CompanyMemberInvitationRecordConflict
  | InvitationExpired
  | InvitationNotFound;

export type CustomerAccountMemberInvitationFailure =
  ManageCustomerAccountInvitationFailure;

export interface InviteCustomerAccountMemberInput {
  readonly actor: CustomerAccountCompanyActor;
  readonly inviteeEmail: Redacted.Redacted;
  readonly inviteeName: {
    readonly firstName: Redacted.Redacted;
    readonly lastName: Redacted.Redacted;
  };
  readonly roles: CompanyRoles;
}

export interface ManageCustomerAccountInvitationInput {
  readonly actor: CustomerAccountCompanyActor;
  readonly companyMemberInvitationId: CustomerAccountCompanyMemberInvitationId;
}

/** A commerce-facing application port. Registration remains the owner of
 * Company Member Invitation intent and implements this port at composition. */
export class CustomerAccountMembers extends Context.Service<
  CustomerAccountMembers,
  {
    readonly cancelInvitation: (
      input: ManageCustomerAccountInvitationInput
    ) => Effect.Effect<void, ManageCustomerAccountInvitationFailure>;
    readonly invite: (
      input: InviteCustomerAccountMemberInput
    ) => Effect.Effect<
      CustomerAccountMemberInvitation,
      InviteCustomerAccountMemberFailure
    >;
    readonly listInvitations: (
      actor: CustomerAccountCompanyActor
    ) => Effect.Effect<
      readonly CustomerAccountInvitationListItem[],
      ManageCustomerAccountInvitationFailure
    >;
    readonly reissueInvitation: (
      input: ManageCustomerAccountInvitationInput
    ) => Effect.Effect<
      CustomerAccountMemberInvitation,
      ManageCustomerAccountInvitationFailure
    >;
  }
>()("@repo/commerce/CustomerAccountMembers") {}
