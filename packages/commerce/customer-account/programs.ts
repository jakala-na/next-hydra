import { Effect, Redacted } from "effect";

import { hasCompanyRole } from "../domain/commerce-account";
import type {
  CommerceCompanyMember,
  CommerceCustomerId,
  CompanyRoles,
} from "../domain/commerce-account";
import { AuthUserId as CustomerAccountAuthUserId } from "../domain/commerce-request-context";
import { CommerceAccounts } from "../services/commerce-accounts";
import type { CommerceAccountUnavailable } from "../services/commerce-accounts";
import { CommerceCompanyMemberships } from "../services/commerce-company-memberships";
import { CommerceContext } from "../services/commerce-context";
import {
  CompanyMemberManagementForbidden,
  CompanyMemberRemovalConflict,
  CustomerAccountCompanyActor,
  CustomerAccountMemberListItem,
  CustomerAccountMembers,
  CustomerAccountPeople,
  CustomerAccountProfileIncomplete,
} from "../services/customer-account-members";
import type {
  CustomerAccountCompanyMemberInvitationId,
  InviteCustomerAccountMemberFailure,
  ManageCustomerAccountInvitationFailure,
} from "../services/customer-account-members";

export interface IssueCompanyMemberInvitationInput {
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly roles: CompanyRoles;
}

type CustomerAccountInvitationFailure =
  | InviteCustomerAccountMemberFailure
  | ManageCustomerAccountInvitationFailure;

const logInvitationDiagnostic = (error: CustomerAccountInvitationFailure) => {
  if (
    error._tag === "CompanyMemberInvitationPersistenceFailure" ||
    error._tag === "InvitationIssueOutcomeUnknown" ||
    error._tag === "InvitationProviderFailure"
  ) {
    return Effect.logError(error.message, error.cause);
  }

  return Effect.void;
};

const getCustomerAccountActor = Effect.fn("CustomerAccount.getCompanyActor")(
  function* () {
    const context = yield* CommerceContext;
    const principal = yield* context.customerPrincipal();
    const profile = yield* context.customerProfile();

    if (profile.email === undefined) {
      return yield* new CustomerAccountProfileIncomplete({
        message:
          "The company administrator profile does not have an email address",
      });
    }

    return new CustomerAccountCompanyActor({
      authUserId: principal.authUserId,
      businessUnitId: principal.businessUnitId,
      email: profile.email,
      roles: principal.roles,
    });
  }
);

export const issueCompanyMemberInvitation = Effect.fn(
  "CustomerAccount.issueCompanyMemberInvitation"
)(function* (input: IssueCompanyMemberInvitationInput) {
  const actor = yield* getCustomerAccountActor();
  const members = yield* CustomerAccountMembers;
  return yield* members
    .invite({
      actor,
      inviteeEmail: Redacted.make(input.email, { label: "email" }),
      inviteeName: {
        firstName: Redacted.make(input.firstName, { label: "personName" }),
        lastName: Redacted.make(input.lastName, { label: "personName" }),
      },
      roles: input.roles,
    })
    .pipe(Effect.tapError(logInvitationDiagnostic));
});

export const cancelCompanyMemberInvitation = Effect.fn(
  "CustomerAccount.cancelCompanyMemberInvitation"
)(function* (
  companyMemberInvitationId: CustomerAccountCompanyMemberInvitationId
) {
  const actor = yield* getCustomerAccountActor();
  const members = yield* CustomerAccountMembers;

  yield* members
    .cancelInvitation({
      actor,
      companyMemberInvitationId,
    })
    .pipe(Effect.tapError(logInvitationDiagnostic));
});

export const reissueCompanyMemberInvitation = Effect.fn(
  "CustomerAccount.reissueCompanyMemberInvitation"
)(function* (
  companyMemberInvitationId: CustomerAccountCompanyMemberInvitationId
) {
  const actor = yield* getCustomerAccountActor();
  const members = yield* CustomerAccountMembers;

  return yield* members
    .reissueInvitation({
      actor,
      companyMemberInvitationId,
    })
    .pipe(Effect.tapError(logInvitationDiagnostic));
});

export const removeCompanyMember = Effect.fn(
  "CustomerAccount.removeCompanyMember"
)(function* (customerId: CommerceCustomerId) {
  const actor = yield* getCustomerAccountActor();
  if (!hasCompanyRole(actor.roles, "admin")) {
    return yield* new CompanyMemberManagementForbidden({
      message: "Only company administrators can remove members",
    });
  }

  const memberships = yield* CommerceCompanyMemberships;
  const customerAccountMembers = yield* CustomerAccountMembers;
  const targetCustomerId = customerId;

  const removeFromCurrentRoster = (
    remainingAttempts: number
  ): Effect.Effect<
    void,
    | CompanyMemberRemovalConflict
    | CommerceAccountUnavailable
    | ManageCustomerAccountInvitationFailure
  > =>
    Effect.gen(function* () {
      const roster = yield* memberships.getRoster(actor.businessUnitId);
      const target = roster.members.find(
        (member) => member.customerId === targetCustomerId
      );

      if (target === undefined) {
        return yield* Effect.void;
      }
      if (target.authUserId === actor.authUserId) {
        return yield* new CompanyMemberRemovalConflict({
          message: "Company administrators cannot remove themselves",
        });
      }
      if (!target.directlyAssociated) {
        return yield* new CompanyMemberRemovalConflict({
          message:
            "This company member is inherited and must be managed by the owning company",
        });
      }

      const invitations = yield* customerAccountMembers
        .listInvitations(actor)
        .pipe(Effect.tapError(logInvitationDiagnostic));
      if (
        invitations.some(
          (invitation) =>
            invitation.status === "accepted" &&
            invitation.acceptedAuthUserId === target.authUserId
        )
      ) {
        return yield* new CompanyMemberRemovalConflict({
          message:
            "This company membership is still completing invitation provisioning",
        });
      }

      const hasAdministratorAfterRemoval = roster.members.some((member) =>
        member.customerId === targetCustomerId
          ? hasCompanyRole(member.inheritedRoles, "admin")
          : hasCompanyRole(member.roles, "admin")
      );
      if (!hasAdministratorAfterRemoval) {
        return yield* new CompanyMemberRemovalConflict({
          message: "The final company administrator cannot be removed",
        });
      }

      return yield* memberships
        .removeMember({
          businessUnitId: actor.businessUnitId,
          customerId: targetCustomerId,
          expectedRevision: roster.revision,
        })
        .pipe(
          Effect.catchTag("CommerceCompanyMembershipChanged", () =>
            remainingAttempts > 0
              ? removeFromCurrentRoster(remainingAttempts - 1)
              : Effect.fail(
                  new CompanyMemberRemovalConflict({
                    message:
                      "Company membership changed repeatedly; refresh before removing this member",
                  })
                )
          )
        );
    });

  return yield* removeFromCurrentRoster(2);
});

const memberNames = (
  member: CommerceCompanyMember
): Pick<CustomerAccountMemberListItem, "firstName" | "lastName"> => {
  if (member.firstName !== undefined && member.lastName !== undefined) {
    return { firstName: member.firstName, lastName: member.lastName };
  }
  if (member.firstName !== undefined) {
    return { firstName: member.firstName };
  }
  if (member.lastName !== undefined) {
    return { lastName: member.lastName };
  }
  return {};
};

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

  if (membership === undefined) {
    return null;
  }

  const canManageMembers = hasCompanyRole(principal.roles, "admin");
  const people = canManageMembers
    ? yield* Effect.gen(function* () {
        const actor = yield* getCustomerAccountActor();
        const invitationService = yield* CustomerAccountMembers;
        const membershipCapability = yield* CommerceCompanyMemberships;
        const [invitations, roster] = yield* Effect.all(
          [
            invitationService.listInvitations(actor),
            membershipCapability.getRoster(actor.businessUnitId),
          ],
          { concurrency: 2 }
        );
        const provisioningAuthUserIds = new Set(
          invitations.flatMap((invitation) =>
            invitation.status === "accepted" &&
            invitation.acceptedAuthUserId !== undefined
              ? [invitation.acceptedAuthUserId]
              : []
          )
        );

        return new CustomerAccountPeople({
          invitations,
          members: roster.members
            .filter(
              (member) =>
                !provisioningAuthUserIds.has(
                  CustomerAccountAuthUserId.make(member.authUserId)
                )
            )
            .map(
              (member) =>
                new CustomerAccountMemberListItem({
                  authUserId: CustomerAccountAuthUserId.make(member.authUserId),
                  canRemove: member.directlyAssociated,
                  customerId: member.customerId,
                  email: member.email,
                  ...memberNames(member),
                  roles: member.roles,
                })
            ),
        });
      })
    : new CustomerAccountPeople({ invitations: [], members: [] });

  return {
    canInvite: canManageMembers,
    canManageMembers,
    companyLabel: membership.businessUnitLabel,
    currentAuthUserId: principal.authUserId,
    people,
  };
});
