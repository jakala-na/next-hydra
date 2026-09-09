import { ActionClient, ActionMiddleware } from "@repo/actions";
import type { EmptyActionContext } from "@repo/actions";
import { makeCustomerAccountProcedures } from "@repo/commerce/customer-account/procedures";
import {
  CommerceBusinessUnitId,
  CommerceBusinessUnitKey,
  CommerceCompanyMember,
  CommerceCustomerId,
  CommerceCustomerProfile,
} from "@repo/commerce/domain/commerce-account";
import {
  AuthUserId,
  CustomerCommercePrincipal,
} from "@repo/commerce/domain/commerce-request-context";
import { CommerceAccounts } from "@repo/commerce/services/commerce-accounts";
import {
  CommerceCompanyMembershipRevision,
  CommerceCompanyMembershipRoster,
  CommerceCompanyMemberships,
} from "@repo/commerce/services/commerce-company-memberships";
import { CommerceContext } from "@repo/commerce/services/commerce-context";
import { CompanyMemberRemovalRecords } from "@repo/commerce/services/company-member-removal-records";
import { CommerceLocale, resolveStore } from "@repo/commerce/store";
import {
  CompanyInvitationPolicy,
  CompanyMemberIdentityProjection,
  CompanyMemberInvitationRecords,
  CompanyMemberInvitations,
  InvitationDeliveries,
  IdentityUsers,
  customerAccountMembersLayer,
} from "@repo/registration";
import { Effect, Layer, ManagedRuntime, Redacted } from "effect";
import { describe, expect, it } from "vitest";

const identityProjectionLayer = Layer.succeed(
  CompanyMemberIdentityProjection,
  CompanyMemberIdentityProjection.of({
    projectAcceptedInvitation: () => Effect.void,
    projectMembership: () => Effect.void,
    removeMembership: () => Effect.void,
  })
);

export const inviteeEmail = "new.user@example.com";

export interface CustomerAccountProviderHarness {
  readonly assertLifecycle: () => void;
  readonly assertIssued: () => void;
  readonly deliveries: InvitationDeliveries["Service"];
  readonly invitationId: string;
  readonly invitations: CompanyMemberInvitations["Service"];
}

const invitationForm = () => {
  const formData = new FormData();
  formData.set("firstName", "Invited");
  formData.set("lastName", "Member");
  formData.set("email", inviteeEmail);
  formData.append("roles[buyer]", "buyer");
  formData.append("roles[approver]", "approver");
  return formData;
};

const managementForm = (companyMemberInvitationId: string) => {
  const formData = new FormData();
  formData.set("companyMemberInvitationId", companyMemberInvitationId);
  return formData;
};

const removalForm = (customerId: string) => {
  const formData = new FormData();
  formData.set("customerId", customerId);
  return formData;
};

const administratorId = CommerceCustomerId.make("customer-1");
const principal = new CustomerCommercePrincipal({
  authUserId: AuthUserId.make("auth-admin-1"),
  businessUnitId: CommerceBusinessUnitId.make("business-unit-1"),
  businessUnitKey: CommerceBusinessUnitKey.make("company-1"),
  customerId: administratorId,
  roles: ["admin", "buyer"],
});

const commerceContext = CommerceContext.of({
  customerPrincipal: () => Effect.succeed(principal),
  customerProfile: () =>
    Effect.succeed(
      new CommerceCustomerProfile({
        customerId: administratorId,
        email: Redacted.make("administrator@example.com", { label: "email" }),
      })
    ),
  principal,
  store: resolveStore({ locale: CommerceLocale.make("en-US") }),
});

export function customerAccountProviderContract(
  name: string,
  make: () => CustomerAccountProviderHarness
): void {
  describe(`customer-account provider contract: ${name}`, () => {
    it("supports the invitation lifecycle through the customer action", async ({
      onTestFinished,
    }) => {
      const provider = make();
      const recordsLayer = CompanyMemberInvitationRecords.layerMemory;
      const memberId = CommerceCustomerId.make("customer-member-1");
      const membershipLayer = CommerceCompanyMemberships.layerMemoryFrom({
        rosters: [
          new CommerceCompanyMembershipRoster({
            businessUnitId: principal.businessUnitId,
            members: [
              new CommerceCompanyMember({
                authUserId: principal.authUserId,
                businessUnitId: principal.businessUnitId,
                customerId: principal.customerId,
                directlyAssociated: true,
                email: Redacted.make("administrator@example.com", {
                  label: "email",
                }),
                inheritedRoles: [],
                roles: principal.roles,
              }),
              new CommerceCompanyMember({
                authUserId: "auth-member-1",
                businessUnitId: principal.businessUnitId,
                customerId: memberId,
                directlyAssociated: true,
                email: Redacted.make("member@example.com", { label: "email" }),
                inheritedRoles: [],
                roles: ["buyer"],
              }),
            ],
            revision: CommerceCompanyMembershipRevision.make("1"),
          }),
        ],
      });
      const membersLayer = customerAccountMembersLayer.pipe(
        Layer.provide(
          Layer.mergeAll(
            Layer.succeed(CompanyMemberInvitations, provider.invitations),
            Layer.succeed(InvitationDeliveries, provider.deliveries),
            recordsLayer,
            CommerceAccounts.layerMemory,
            identityProjectionLayer,
            IdentityUsers.layerMemory
          )
        ),
        Layer.provide(CompanyInvitationPolicy.layer)
      );
      const runtime = ManagedRuntime.make(
        Layer.mergeAll(
          membersLayer,
          recordsLayer,
          membershipLayer,
          CompanyMemberRemovalRecords.layerMemory
        )
      );
      onTestFinished(async () => {
        await runtime.dispose();
      });
      const actions = ActionClient.make(runtime)
        .use(
          ActionMiddleware.context<
            EmptyActionContext,
            { readonly locale: "en-US" }
          >(() => Effect.succeed({ locale: "en-US" }))
        )
        .provide(() => Layer.succeed(CommerceContext, commerceContext));
      const {
        cancelCompanyMemberInvitationProcedure,
        inviteCompanyMemberProcedure,
        reissueCompanyMemberInvitationProcedure,
        removeCompanyMemberProcedure,
      } = makeCustomerAccountProcedures(actions);

      const result = await inviteCompanyMemberProcedure.toFormAction({
        getFailureMessage: (error) => error._tag,
      })(null, invitationForm());

      expect(result).toMatchObject({
        _tag: "Success",
        success: {
          invitationId: provider.invitationId,
          inviteeEmail,
          outcome: "invitation_sent",
        },
      });
      provider.assertIssued();

      const [stored] = await runtime.runPromise(
        CompanyMemberInvitationRecords.pipe(
          Effect.flatMap((records) =>
            records.listByBusinessUnit(principal.businessUnitId)
          )
        )
      );
      if (stored === undefined) {
        throw new Error("Expected a durable company member invitation");
      }
      const { companyMemberInvitationId } = stored.intent;
      const cancelResult =
        await cancelCompanyMemberInvitationProcedure.toFormAction({
          getFailureMessage: (error) => error._tag,
        })(null, managementForm(companyMemberInvitationId));
      const reissueResult =
        await reissueCompanyMemberInvitationProcedure.toFormAction({
          getFailureMessage: (error) => error._tag,
        })(null, managementForm(companyMemberInvitationId));
      const removeResult = await removeCompanyMemberProcedure.toFormAction({
        getFailureMessage: (error) => error._tag,
      })(null, removalForm(memberId));

      expect(cancelResult).toMatchObject({
        _tag: "Success",
        success: { operation: "cancel" },
      });
      expect(reissueResult).toMatchObject({
        _tag: "Success",
        success: { operation: "reissue" },
      });
      expect(removeResult).toMatchObject({
        _tag: "Success",
        success: { operation: "remove" },
      });
      const roster = await runtime.runPromise(
        CommerceCompanyMemberships.pipe(
          Effect.flatMap((memberships) =>
            memberships.getRoster(principal.businessUnitId)
          )
        )
      );
      expect(roster.members.map(({ customerId }) => customerId)).toStrictEqual([
        principal.customerId,
      ]);
      provider.assertLifecycle();
    });
  });
}
