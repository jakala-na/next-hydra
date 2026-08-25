/* oxlint-disable typescript/no-unsafe-argument, typescript/no-unsafe-assignment, typescript/no-unsafe-call, typescript/no-unsafe-member-access, typescript/no-unsafe-return -- The maintainer-only matrix crosses package-local TypeScript projects; every value is constructed through the providers' exported types and independently typechecked in its owning package. */
import { ActionClient, ActionMiddleware } from "@repo/actions";
import type { EmptyActionContext } from "@repo/actions";
import { makeClerkCompanyMemberInvitations } from "@repo/auth-clerk/invitations";
import type { ClerkInvitationsApi } from "@repo/auth-clerk/invitations";
import { makeWorkosCompanyMemberInvitations } from "@repo/auth-workos/invitations";
import type { WorkosInvitationSender } from "@repo/auth-workos/invitations";
import { makeCustomerAccountProcedures } from "@repo/commerce/customer-account/procedures";
import {
  CommerceBusinessUnitId,
  CommerceBusinessUnitKey,
  CommerceCustomerId,
  CommerceCustomerProfile,
} from "@repo/commerce/domain/commerce-account";
import {
  AuthUserId,
  CustomerCommercePrincipal,
} from "@repo/commerce/domain/commerce-request-context";
import { CommerceContext } from "@repo/commerce/services/commerce-context";
import { CommerceLocale, resolveStore } from "@repo/commerce/store";
import {
  CompanyInvitationPolicy,
  CompanyMemberInvitations,
  customerAccountMembersLayer,
} from "@repo/registration";
import { Effect, Layer, ManagedRuntime, Redacted } from "effect";
import { describe, expect, it, vi } from "vitest";

const inviteeEmail = "new.user@example.com";

const clerkProvider = () => {
  const createInvitation = vi.fn<ClerkInvitationsApi["createInvitation"]>(
    async (input) =>
      await Promise.resolve({
        createdAt: Date.parse("2026-08-25T12:00:00.000Z"),
        emailAddress: input.emailAddress,
        id: "clerk-invitation-1",
        publicMetadata: input.publicMetadata,
        status: "pending",
        updatedAt: Date.parse("2026-08-25T12:00:00.000Z"),
        url: "https://clerk.example.test/invitations/accept",
      })
  );
  const api: ClerkInvitationsApi = {
    createInvitation,
    getInvitationList: async () => await Promise.resolve({ data: [] }),
    revokeInvitation: async () => await Promise.reject(new Error("not used")),
  };

  return {
    assertIssued: () => {
      expect(createInvitation).toHaveBeenCalledWith(
        expect.objectContaining({
          emailAddress: inviteeEmail,
          publicMetadata: {
            invitation: {
              businessUnitId: "business-unit-1",
              intent: "company_member",
              roles: ["buyer", "approver"],
            },
          },
        })
      );
    },
    invitationId: "clerk-invitation-1",
    invitations: makeClerkCompanyMemberInvitations(
      api,
      "https://shop.example.test/accept-invitation"
    ),
  };
};

const workosProvider = () => {
  const sendInvitation = vi.fn<WorkosInvitationSender["sendInvitation"]>(
    async (input) =>
      await Promise.resolve({
        acceptInvitationUrl: "https://workos.example.test/invitations/accept",
        acceptedAt: null,
        acceptedUserId: null,
        createdAt: "2026-08-25T12:00:00.000Z",
        email: input.email,
        expiresAt: "2026-09-24T12:00:00.000Z",
        id: "workos-invitation-1",
        inviterUserId: input.inviterUserId ?? null,
        object: "invitation",
        organizationId: null,
        revokedAt: null,
        state: "pending",
        token: "token-1",
        updatedAt: "2026-08-25T12:00:00.000Z",
      })
  );
  const userManagement: WorkosInvitationSender = {
    sendInvitation,
  };

  return {
    assertIssued: () => {
      expect(sendInvitation).toHaveBeenCalledWith({
        email: inviteeEmail,
        inviterUserId: "auth-admin-1",
      });
    },
    invitationId: "workos-invitation-1",
    invitations: makeWorkosCompanyMemberInvitations(userManagement),
  };
};

interface ProviderHarness {
  readonly assertIssued: () => void;
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
  formData.set("email", inviteeEmail);
  formData.append("roles[buyer]", "buyer");
  formData.append("roles[approver]", "approver");
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
      const membersLayer = customerAccountMembersLayer.pipe(
        Layer.provide(
          Layer.succeed(CompanyMemberInvitations, provider.invitations)
        ),
        Layer.provide(CompanyInvitationPolicy.layer)
      );
      const runtime = ManagedRuntime.make(membersLayer);
      const actions = ActionClient.make(runtime)
        .use(
          ActionMiddleware.context<
            EmptyActionContext,
            { readonly locale: "en-US" }
          >(() => Effect.succeed({ locale: "en-US" }))
        )
        .provide(() => Layer.succeed(CommerceContext, commerceContext));
      const { inviteCompanyMemberProcedure } =
        makeCustomerAccountProcedures(actions);

      const result = await inviteCompanyMemberProcedure.toFormAction({
        getFailureMessage: (error) => error._tag,
      })(null, invitationForm());

      expect(result).toMatchObject({
        _tag: "Success",
        success: {
          invitationId: provider.invitationId,
          inviteeEmail,
        },
      });
      provider.assertIssued();
    }
  );
});
