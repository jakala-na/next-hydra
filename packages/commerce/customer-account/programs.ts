import { Effect, Redacted } from "effect";

import type { CompanyRoles } from "../domain/commerce-account";
import { hasCompanyRole } from "../domain/commerce-account";
import { CommerceAccounts } from "../services/commerce-accounts";
import { CommerceContext } from "../services/commerce-context";
import {
  CustomerAccountCompanyActor,
  CustomerAccountMembers,
  CustomerAccountProfileIncomplete,
} from "../services/customer-account-members";

export interface IssueCompanyMemberInvitationInput {
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly roles: CompanyRoles;
}

export const issueCompanyMemberInvitation = Effect.fn(
  "CustomerAccount.issueCompanyMemberInvitation"
)(function* (input: IssueCompanyMemberInvitationInput) {
  const context = yield* CommerceContext;
  const principal = yield* context.customerPrincipal();
  const profile = yield* context.customerProfile();

  if (profile.email === undefined) {
    return yield* new CustomerAccountProfileIncomplete({
      message: "The inviting customer profile does not have an email address",
    });
  }

  const members = yield* CustomerAccountMembers;
  return yield* members
    .invite({
      actor: new CustomerAccountCompanyActor({
        authUserId: principal.authUserId,
        businessUnitId: principal.businessUnitId,
        email: profile.email,
        roles: principal.roles,
      }),
      inviteeEmail: Redacted.make(input.email, { label: "email" }),
      inviteeName: {
        firstName: Redacted.make(input.firstName, { label: "personName" }),
        lastName: Redacted.make(input.lastName, { label: "personName" }),
      },
      roles: input.roles,
    })
    .pipe(
      Effect.tapError((error) =>
        error._tag === "InvitationProviderFailure" ||
        error._tag === "InvitationIssueOutcomeUnknown"
          ? Effect.logError(error.message, error.cause)
          : Effect.void
      )
    );
});

export const getCustomerAccountOverview = Effect.fn(
  "CustomerAccount.getOverview"
)(function* () {
  const context = yield* CommerceContext;
  const principal = yield* context.customerPrincipal();
  const accounts = yield* CommerceAccounts;
  const memberships =
    yield* accounts.listBusinessUnitMembershipsForCustomerInStore(
      principal.customerId,
      context.store.storeKey
    );
  const membership = memberships.find(
    ({ businessUnitId }) => businessUnitId === principal.businessUnitId
  );

  return membership === undefined
    ? null
    : {
        canInvite: hasCompanyRole(principal.roles, "admin"),
        companyLabel: membership.businessUnitLabel,
      };
});
