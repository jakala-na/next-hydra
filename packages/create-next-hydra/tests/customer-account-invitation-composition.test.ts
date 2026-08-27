/* oxlint-disable typescript/no-unsafe-argument, typescript/no-unsafe-assignment, typescript/no-unsafe-call, typescript/no-unsafe-member-access, typescript/no-unsafe-return -- The maintainer-only matrix crosses package-local TypeScript projects; every value is constructed through the providers' exported types and independently typechecked in its owning package. */
import { ActionClient, ActionMiddleware } from "@repo/actions";
import type { EmptyActionContext } from "@repo/actions";
import {
  makeClerkCompanyMemberInvitations,
  makeClerkInvitationDeliveries,
} from "@repo/auth-clerk/invitations";
import type { ClerkInvitationsApi } from "@repo/auth-clerk/invitations";
import {
  makeWorkosCompanyMemberInvitations,
  makeWorkosInvitationDeliveries,
} from "@repo/auth-workos/invitations";
import type {
  WorkosCompanyMemberInvitationUserManagement,
  WorkosInvitationSender,
} from "@repo/auth-workos/invitations";
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
import { describe, expect, it, vi } from "vitest";

const identityProjectionLayer = Layer.succeed(
  CompanyMemberIdentityProjection,
  CompanyMemberIdentityProjection.of({
    projectAcceptedInvitation: () => Effect.void,
    projectMembership: () => Effect.void,
    removeMembership: () => Effect.void,
  })
);

const inviteeEmail = "new.user@example.com";

const clerkProvider = () => {
  const invitations = new Map<
    string,
    Awaited<ReturnType<ClerkInvitationsApi["createInvitation"]>>
  >();
  const createInvitation = vi.fn<ClerkInvitationsApi["createInvitation"]>(
    async (input) => {
      const id = `clerk-invitation-${invitations.size + 1}`;
      const invitation = {
        createdAt: Date.parse("2026-08-25T12:00:00.000Z"),
        emailAddress: input.emailAddress,
        id,
        publicMetadata: input.publicMetadata,
        status: "pending",
        updatedAt: Date.parse("2026-08-25T12:00:00.000Z"),
        url: "https://clerk.example.test/invitations/accept",
      } as const;
      invitations.set(id, invitation);
      return await Promise.resolve(invitation);
    }
  );
  const revokeInvitation = vi.fn<ClerkInvitationsApi["revokeInvitation"]>(
    async (id) => {
      const current = invitations.get(id);
      if (current === undefined) {
        throw new Error(`Unknown Clerk invitation ${id}`);
      }
      const revoked = { ...current, status: "revoked" as const };
      invitations.set(id, revoked);
      return await Promise.resolve(revoked);
    }
  );
  const api: ClerkInvitationsApi = {
    createInvitation,
    getInvitationList: async ({ query, status }) =>
      await Promise.resolve({
        data: [...invitations.values()].filter(
          (invitation) =>
            invitation.id === query &&
            (status === undefined || invitation.status === status)
        ),
      }),
    revokeInvitation,
  };

  return {
    assertIssued: () => {
      expect(createInvitation).toHaveBeenCalledWith(
        expect.objectContaining({
          emailAddress: inviteeEmail,
          publicMetadata: {
            invitation: {
              businessUnitId: "business-unit-1",
              companyMemberInvitationId: expect.stringMatching(
                /^company-member-invitation-/u
              ),
              intent: "company_member",
              roles: ["buyer", "approver"],
            },
          },
        })
      );
    },
    assertLifecycle: () => {
      expect(createInvitation).toHaveBeenCalledTimes(2);
      expect(revokeInvitation).toHaveBeenCalledWith("clerk-invitation-1");
    },
    deliveries: makeClerkInvitationDeliveries(api),
    invitationId: "clerk-invitation-1",
    invitations: makeClerkCompanyMemberInvitations(
      api,
      "https://shop.example.test/accept-invitation"
    ),
  };
};

const workosProvider = () => {
  const invitations = new Map<
    string,
    {
      acceptInvitationUrl: string;
      acceptedAt: null;
      acceptedUserId: null;
      createdAt: string;
      email: string;
      expiresAt: string;
      id: string;
      inviterUserId: string | null;
      object: "invitation";
      organizationId: null;
      revokedAt: string | null;
      state: "pending" | "revoked";
      token: string;
      updatedAt: string;
    }
  >();
  const sendInvitation = vi.fn<WorkosInvitationSender["sendInvitation"]>(
    async (input) => {
      const id = `workos-invitation-${invitations.size + 1}`;
      const invitation = {
        acceptInvitationUrl: "https://workos.example.test/invitations/accept",
        acceptedAt: null,
        acceptedUserId: null,
        createdAt: "2026-08-25T12:00:00.000Z",
        email: input.email,
        expiresAt: "2026-09-24T12:00:00.000Z",
        id,
        inviterUserId: input.inviterUserId ?? null,
        object: "invitation",
        organizationId: null,
        revokedAt: null,
        state: "pending",
        token: "token-1",
        updatedAt: "2026-08-25T12:00:00.000Z",
      } as const;
      invitations.set(id, invitation);
      return await Promise.resolve(invitation);
    }
  );
  const revokeInvitation = vi.fn<
    WorkosCompanyMemberInvitationUserManagement["revokeInvitation"]
  >(async (id) => {
    const current = invitations.get(id);
    if (current === undefined) {
      throw new Error(`Unknown WorkOS invitation ${id}`);
    }
    const revoked = {
      ...current,
      revokedAt: "2026-08-26T12:00:00.000Z",
      state: "revoked" as const,
    };
    invitations.set(id, revoked);
    return await Promise.resolve(revoked);
  });
  const userManagement: WorkosCompanyMemberInvitationUserManagement = {
    getInvitation: async (id) => {
      const invitation = invitations.get(id);
      return invitation === undefined
        ? await Promise.reject(new Error(`Unknown WorkOS invitation ${id}`))
        : await Promise.resolve(invitation);
    },
    revokeInvitation,
    sendInvitation,
  };

  return {
    assertIssued: () => {
      expect(sendInvitation).toHaveBeenCalledWith({
        email: inviteeEmail,
        inviterUserId: "auth-admin-1",
      });
    },
    assertLifecycle: () => {
      expect(sendInvitation).toHaveBeenCalledTimes(2);
      expect(revokeInvitation).toHaveBeenCalledWith("workos-invitation-1");
    },
    deliveries: makeWorkosInvitationDeliveries(userManagement),
    invitationId: "workos-invitation-1",
    invitations: makeWorkosCompanyMemberInvitations(userManagement),
  };
};

interface ProviderHarness {
  readonly assertLifecycle: () => void;
  readonly assertIssued: () => void;
  readonly deliveries: InvitationDeliveries["Service"];
  readonly invitationId: string;
  readonly invitations: CompanyMemberInvitations["Service"];
}

interface ProviderCase {
  readonly make: () => ProviderHarness;
  readonly name: string;
}

const providers: readonly ProviderCase[] = [
  { make: clerkProvider, name: "Clerk" },
  { make: workosProvider, name: "WorkOS" },
];

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

describe("customer-account provider composition", () => {
  it.each(providers)(
    "composes the $name factory through the customer action",
    async (providerCase) => {
      const provider = providerCase.make();
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
    }
  );
});
