import type { IdentityMembershipProjectionFailure } from "@repo/auth-contract/identity-memberships";
import type { CommerceAssociateMembership } from "@repo/commerce/domain/commerce-account";
import { CommerceAccounts } from "@repo/commerce/services/commerce-accounts";
import type {
  CommerceAccountUnavailable,
  CommerceCustomerEmailConflict,
} from "@repo/commerce/services/commerce-accounts";
import { Effect } from "effect";

import type { CompanyActor } from "../domain/actors";
import type { AcceptedAuthIdentity } from "../domain/identity";
import type { ApprovedRegistration } from "../domain/registration";
import { INITIAL_COMPANY_ROLES } from "../domain/roles";
import type { CompanyRoles } from "../domain/roles";
import { CompanyInvitationPolicy } from "../services/company-invitation-policy";
import type { InvitationPolicyError } from "../services/company-invitation-policy";
import { CompanyMemberIdentityProjection } from "../services/company-member-identity-projection";
import type { InvitationConflict } from "../services/invitations";

export interface ProvisionScenarioCompanyInput {
  readonly acceptedIdentity: AcceptedAuthIdentity;
  readonly registration: ApprovedRegistration;
}

export interface ProvisionScenarioCompanyMemberInput {
  readonly acceptedIdentity: AcceptedAuthIdentity;
  readonly actor: CompanyActor;
  readonly roles: CompanyRoles;
}

/**
 * E2E-only setup for scenarios whose subject is behavior after Registration.
 * It intentionally starts from an already-approved Registration aggregate.
 */
export const provisionScenarioCompany = Effect.fn(
  "RegistrationE2E.provisionScenarioCompany"
)(function* (input: ProvisionScenarioCompanyInput) {
  const commerceAccounts = yield* CommerceAccounts;
  const identityProjection = yield* CompanyMemberIdentityProjection;
  const commerceAccount = yield* commerceAccounts.createFromRegistration(
    input.registration
  );

  yield* commerceAccounts.linkRegistrantIdentity({
    acceptedIdentity: input.acceptedIdentity,
    commerceAccount,
  });
  yield* identityProjection.projectMembership({
    authUserId: input.acceptedIdentity.authUserId,
    businessUnitId: commerceAccount.businessUnitId,
    roles: INITIAL_COMPANY_ROLES,
  });

  return commerceAccount;
});

/**
 * E2E-only setup for scenarios whose subject is behavior after membership.
 * Production membership creation remains available only through guarded flows.
 */
export const provisionScenarioCompanyMember = (
  input: ProvisionScenarioCompanyMemberInput
): Effect.Effect<
  CommerceAssociateMembership,
  | CommerceAccountUnavailable
  | CommerceCustomerEmailConflict
  | IdentityMembershipProjectionFailure
  | InvitationConflict
  | InvitationPolicyError,
  CommerceAccounts | CompanyInvitationPolicy | CompanyMemberIdentityProjection
> =>
  Effect.gen(function* () {
    const policy = yield* CompanyInvitationPolicy;
    const commerceAccounts = yield* CommerceAccounts;
    const identityProjection = yield* CompanyMemberIdentityProjection;

    yield* policy.authorizeIssueInvite({
      actor: input.actor,
      inviteeEmail: input.acceptedIdentity.email,
      roles: input.roles,
    });
    const membership = yield* commerceAccounts.addAssociate({
      acceptedIdentity: input.acceptedIdentity,
      businessUnitId: input.actor.businessUnitId,
      roles: input.roles,
    });
    yield* identityProjection.projectMembership({
      authUserId: input.acceptedIdentity.authUserId,
      businessUnitId: membership.businessUnitId,
      roles: membership.roles,
    });

    return membership;
  });
