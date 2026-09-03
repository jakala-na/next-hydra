/* oxlint-disable anti-slop/no-chained-type-assertions, anti-slop/no-module-mocking, anti-slop/require-safety-comment-for-type-assertion, eslint/require-await, typescript/no-unsafe-argument, typescript/no-unsafe-assignment, typescript/no-unsafe-type-assertion, vitest/max-expects, vitest/no-conditional-expect -- This application-composition test must replace fixed external application bindings while preserving the real generated action, app runtime, Registration adapter, and selected auth-provider factory. The selected @repo/auth package is validated against the two supported factory shapes before use, and the conditional expected value asserts the provider-specific SDK call without conditionally skipping an assertion. The single scenario intentionally checkpoints the ordered lifecycle through one retained runtime. */
import type {
  CompanyMemberInvitations,
  InvitationDeliveries,
} from "@repo/registration";
import { describe, expect, it, vi } from "vitest";

interface ClerkHarnessInvitation {
  readonly createdAt: number;
  readonly emailAddress: string;
  readonly id: string;
  readonly publicMetadata: unknown;
  status: "accepted" | "expired" | "pending" | "revoked";
  updatedAt: number;
  readonly url: string;
}

interface WorkosHarnessInvitation {
  readonly acceptInvitationUrl: string;
  readonly acceptedAt: null;
  readonly acceptedUserId: null;
  readonly createdAt: string;
  readonly email: string;
  readonly expiresAt: string;
  readonly id: string;
  readonly inviterUserId: string;
  readonly object: "invitation";
  readonly organizationId: null;
  revokedAt: null | string;
  state: "pending" | "revoked";
  readonly token: string;
  updatedAt: string;
}

interface ProviderHarnessState {
  readonly clerkCreateInvitation: ReturnType<
    typeof vi.fn<
      (input: {
        readonly emailAddress: string;
        readonly publicMetadata: unknown;
      }) => Promise<ClerkHarnessInvitation>
    >
  >;
  readonly clerkGetInvitationList: ReturnType<
    typeof vi.fn<
      (input: {
        readonly query: string;
        readonly status?: ClerkHarnessInvitation["status"];
      }) => Promise<{ readonly data: readonly ClerkHarnessInvitation[] }>
    >
  >;
  readonly clerkInvitations: Map<string, ClerkHarnessInvitation>;
  readonly clerkRevokeInvitation: ReturnType<
    typeof vi.fn<(invitationId: string) => Promise<ClerkHarnessInvitation>>
  >;
  selected: "" | "Clerk" | "WorkOS";
  readonly sendInvitation: ReturnType<
    typeof vi.fn<
      (input: { readonly email: string }) => Promise<WorkosHarnessInvitation>
    >
  >;
  readonly workosGetInvitation: ReturnType<
    typeof vi.fn<(invitationId: string) => Promise<WorkosHarnessInvitation>>
  >;
  readonly workosInvitations: Map<string, WorkosHarnessInvitation>;
  readonly workosRevokeInvitation: ReturnType<
    typeof vi.fn<(invitationId: string) => Promise<WorkosHarnessInvitation>>
  >;
}

const provider = vi.hoisted<ProviderHarnessState>(() => {
  const clerkInvitations = new Map<string, ClerkHarnessInvitation>();
  const workosInvitations = new Map<string, WorkosHarnessInvitation>();
  const clerkCreateInvitation = vi.fn<
    (input: {
      readonly emailAddress: string;
      readonly publicMetadata: unknown;
    }) => Promise<ClerkHarnessInvitation>
  >(async (input) => {
    const sequence = clerkInvitations.size + 1;
    const invitation: ClerkHarnessInvitation = {
      createdAt: Date.parse("2026-08-25T12:00:00.000Z"),
      emailAddress: input.emailAddress,
      id: `clerk-invitation-${sequence}`,
      publicMetadata: input.publicMetadata,
      status: "pending",
      updatedAt: Date.parse("2026-08-25T12:00:00.000Z"),
      url: "https://clerk.example.test/invitations/accept",
    };
    clerkInvitations.set(invitation.id, invitation);
    return invitation;
  });
  const sendInvitation = vi.fn<
    (input: { readonly email: string }) => Promise<WorkosHarnessInvitation>
  >(async (input) => {
    const sequence = workosInvitations.size + 1;
    const invitation: WorkosHarnessInvitation = {
      acceptInvitationUrl: "https://workos.example.test/invitations/accept",
      acceptedAt: null,
      acceptedUserId: null,
      createdAt: "2026-08-25T12:00:00.000Z",
      email: input.email,
      expiresAt: "2026-09-24T12:00:00.000Z",
      id: `workos-invitation-${sequence}`,
      inviterUserId: "auth-admin-1",
      object: "invitation",
      organizationId: null,
      revokedAt: null,
      state: "pending",
      token: `token-${sequence}`,
      updatedAt: "2026-08-25T12:00:00.000Z",
    };
    workosInvitations.set(invitation.id, invitation);
    return invitation;
  });

  return {
    clerkCreateInvitation,
    clerkGetInvitationList: vi.fn<
      (input: {
        readonly query: string;
        readonly status?: ClerkHarnessInvitation["status"];
      }) => Promise<{ readonly data: readonly ClerkHarnessInvitation[] }>
    >(async ({ query, status }) => ({
      data: [...clerkInvitations.values()].filter(
        (invitation) =>
          invitation.id === query &&
          (status === undefined || invitation.status === status)
      ),
    })),
    clerkInvitations,
    clerkRevokeInvitation: vi.fn<
      (invitationId: string) => Promise<ClerkHarnessInvitation>
    >(async (invitationId) => {
      const invitation = clerkInvitations.get(invitationId);
      if (invitation === undefined) {
        throw new Error(`Missing Clerk invitation ${invitationId}`);
      }
      invitation.status = "revoked";
      invitation.updatedAt = Date.parse("2026-08-25T13:00:00.000Z");
      return invitation;
    }),
    selected: "",
    sendInvitation,
    workosGetInvitation: vi.fn<
      (invitationId: string) => Promise<WorkosHarnessInvitation>
    >(async (invitationId) => {
      const invitation = workosInvitations.get(invitationId);
      if (invitation === undefined) {
        throw new Error(`Missing WorkOS invitation ${invitationId}`);
      }
      return invitation;
    }),
    workosInvitations,
    workosRevokeInvitation: vi.fn<
      (invitationId: string) => Promise<WorkosHarnessInvitation>
    >(async (invitationId) => {
      const invitation = workosInvitations.get(invitationId);
      if (invitation === undefined) {
        throw new Error(`Missing WorkOS invitation ${invitationId}`);
      }
      invitation.revokedAt = "2026-08-25T13:00:00.000Z";
      invitation.state = "revoked";
      invitation.updatedAt = "2026-08-25T13:00:00.000Z";
      return invitation;
    }),
  };
});

interface SelectedAuthInvitationFactories {
  readonly makeClerkInvitationDeliveries?: (api: {
    readonly createInvitation: typeof provider.clerkCreateInvitation;
    readonly getInvitationList: typeof provider.clerkGetInvitationList;
    readonly revokeInvitation: typeof provider.clerkRevokeInvitation;
  }) => InvitationDeliveries["Service"];
  readonly makeClerkCompanyMemberInvitations?: (
    api: {
      readonly createInvitation: typeof provider.clerkCreateInvitation;
      readonly getInvitationList: typeof provider.clerkGetInvitationList;
      readonly revokeInvitation: typeof provider.clerkRevokeInvitation;
    },
    redirectUrl: string
  ) => CompanyMemberInvitations["Service"];
  readonly makeWorkosCompanyMemberInvitations?: (api: {
    readonly getInvitation: typeof provider.workosGetInvitation;
    readonly revokeInvitation: typeof provider.workosRevokeInvitation;
    readonly sendInvitation: typeof provider.sendInvitation;
  }) => CompanyMemberInvitations["Service"];
  readonly makeWorkosInvitationDeliveries?: (api: {
    readonly getInvitation: typeof provider.workosGetInvitation;
  }) => InvitationDeliveries["Service"];
}

vi.mock(import("@repo/auth/invitations"), async (importOriginal) => {
  const actual = await importOriginal();
  const {
    CompanyMemberIdentityProjection,
    CompanyMemberInvitations,
    InvitationDeliveries,
  } = await import("@repo/registration");
  const { Effect, Layer } = await import("effect");
  const companyMemberIdentityProjectionLayer = Layer.succeed(
    CompanyMemberIdentityProjection,
    CompanyMemberIdentityProjection.of({
      projectAcceptedInvitation: () => Effect.void,
      projectMembership: () => Effect.void,
      removeMembership: () => Effect.void,
    })
  );
  const selected = actual as unknown as typeof actual &
    SelectedAuthInvitationFactories;

  if (
    selected.makeClerkCompanyMemberInvitations !== undefined &&
    selected.makeClerkInvitationDeliveries !== undefined
  ) {
    provider.selected = "Clerk";
    const api = {
      createInvitation: provider.clerkCreateInvitation,
      getInvitationList: provider.clerkGetInvitationList,
      revokeInvitation: provider.clerkRevokeInvitation,
    };
    return {
      ...actual,
      companyMemberIdentityProjectionLayer,
      companyMemberInvitationsLayer: Layer.merge(
        Layer.succeed(
          CompanyMemberInvitations,
          selected.makeClerkCompanyMemberInvitations(
            api,
            "https://shop.example.test/accept-invitation"
          )
        ),
        Layer.succeed(
          InvitationDeliveries,
          selected.makeClerkInvitationDeliveries(api)
        )
      ),
    };
  }

  if (
    selected.makeWorkosCompanyMemberInvitations === undefined ||
    selected.makeWorkosInvitationDeliveries === undefined
  ) {
    throw new Error(
      "The selected auth provider does not expose a company invitation factory"
    );
  }
  provider.selected = "WorkOS";

  return {
    ...actual,
    companyMemberIdentityProjectionLayer,
    companyMemberInvitationsLayer: Layer.merge(
      Layer.succeed(
        CompanyMemberInvitations,
        selected.makeWorkosCompanyMemberInvitations({
          getInvitation: provider.workosGetInvitation,
          revokeInvitation: provider.workosRevokeInvitation,
          sendInvitation: provider.sendInvitation,
        })
      ),
      Layer.succeed(
        InvitationDeliveries,
        selected.makeWorkosInvitationDeliveries({
          getInvitation: provider.workosGetInvitation,
        })
      )
    ),
  };
});

vi.mock(import("@repo/auth/identity-users"), async () => {
  const { IdentityUsers } = await import("@repo/registration");

  return { identityUsersLayer: IdentityUsers.layerMemory };
});

vi.mock(import("@repo/commerce-provider/provider"), async (importOriginal) => {
  const actual = await importOriginal();
  const {
    CommerceBusinessUnitId,
    CommerceBusinessUnitKey,
    CommerceBusinessUnitLabel,
    CommerceCompanyMember,
    CommerceCustomerId,
    CommerceCustomerProfile,
  } = await import("@repo/commerce/domain/commerce-account");
  const { AuthUserId } =
    await import("@repo/commerce/domain/commerce-request-context");
  const { AddressBook } = await import("@repo/commerce/services/address-book");
  const { Carts } = await import("@repo/commerce/services/carts");
  const { CommerceAccounts } =
    await import("@repo/commerce/services/commerce-accounts");
  const {
    CommerceCompanyMembershipRevision,
    CommerceCompanyMembershipRoster,
    CommerceCompanyMemberships,
  } = await import("@repo/commerce/services/commerce-company-memberships");
  const { ProductDiscovery } = await import("@repo/commerce/product");
  const { StoreKey } = await import("@repo/commerce/store");
  const { Redacted } = await import("effect");

  const customerId = CommerceCustomerId.make("customer-1");
  const memberId = CommerceCustomerId.make("customer-member-1");
  const businessUnitId = CommerceBusinessUnitId.make("business-unit-1");

  return {
    ...actual,
    addressBookLayer: AddressBook.layerMemory(),
    cartsLayer: Carts.layerMemory(),
    commerceAccountsLayer: CommerceAccounts.layerMemoryFrom({
      businessUnitMemberships: [
        {
          customerId,
          membership: {
            businessUnitId: CommerceBusinessUnitId.make("business-unit-1"),
            businessUnitKey: CommerceBusinessUnitKey.make("company-1"),
            businessUnitLabel: CommerceBusinessUnitLabel.make("Company One"),
            roles: ["admin", "buyer"],
          },
          storeKey: StoreKey.make("default-store"),
        },
      ],
      customerProfiles: [
        new CommerceCustomerProfile({
          customerId,
          email: Redacted.make("administrator@example.com", {
            label: "email",
          }),
        }),
      ],
      customers: [
        {
          authUserId: AuthUserId.make("auth-admin-1"),
          customerId,
        },
      ],
    }),
    commerceCompanyMembershipsLayer: CommerceCompanyMemberships.layerMemoryFrom(
      {
        rosters: [
          new CommerceCompanyMembershipRoster({
            businessUnitId,
            members: [
              new CommerceCompanyMember({
                authUserId: "auth-admin-1",
                businessUnitId,
                customerId,
                directlyAssociated: true,
                email: Redacted.make("administrator@example.com", {
                  label: "email",
                }),
                inheritedRoles: [],
                roles: ["admin", "buyer"],
              }),
              new CommerceCompanyMember({
                authUserId: "auth-member-1",
                businessUnitId,
                customerId: memberId,
                directlyAssociated: true,
                email: Redacted.make("existing.member@example.com", {
                  label: "email",
                }),
                inheritedRoles: [],
                roles: ["buyer"],
              }),
            ],
            revision: CommerceCompanyMembershipRevision.make("1"),
          }),
        ],
      }
    ),
    productDiscoveryLayer: ProductDiscovery.testLayer(),
  };
});

vi.mock(import("@repo/commerce-provider/versioned-store"), async () => {
  const { VersionedKeyValueStore } = await import("@repo/versioned-store");
  const { Layer } = await import("effect");
  const companyMemberInvitationContainer =
    "customer-company-member-invitations" as const;
  return {
    DEFAULT_COMPANY_MEMBER_INVITATION_CONTAINER:
      companyMemberInvitationContainer,
    versionedKeyValueStoreLayer: () =>
      Layer.fresh(VersionedKeyValueStore.layerMemory),
  };
});

vi.mock(import("@repo/observability/effect"), async () => {
  const { Layer } = await import("effect");
  return { sentryEffectTelemetryLayer: Layer.empty };
});

vi.mock(import("./current-auth"), async () => {
  const { Effect, Layer } = await import("effect");
  const { CurrentAuth } = await import("./current-auth-api");

  return {
    currentAuthLayer: Layer.succeed(CurrentAuth, {
      snapshot: Effect.succeed({
        permissions: { has: () => false },
        userId: "auth-admin-1",
      }),
    }),
  };
});

vi.mock(import("./next-request"), async () => {
  const { Effect, Layer } = await import("effect");
  const { NextRequestApi } = await import("./next-request-api");

  return {
    NextRequestApi,
    nextRequestApiLayer: Layer.succeed(NextRequestApi, {
      connect: () => Effect.void,
      getCookies: () =>
        Effect.succeed({
          delete: () => undefined,
          get: () => undefined,
          set: () => undefined,
        }),
      getLocale: () => Effect.succeed("en-US" as const),
    }),
  };
});

vi.mock(import("./next-server"), async () => {
  const { NextServer } = await import("@repo/actions/next-server");
  const { Effect, Layer } = await import("effect");

  return {
    nextServerLayer: Layer.succeed(NextServer, {
      refresh: () => Effect.void,
      revalidatePath: () => Effect.void,
    }),
  };
});

const invitationForm = () => {
  const formData = new FormData();
  formData.set("firstName", "Invited");
  formData.set("lastName", "Member");
  formData.set("email", "member@example.com");
  formData.append("roles[buyer]", "buyer");
  formData.append("roles[approver]", "approver");
  return formData;
};

const managementForm = (name: string, value: string) => {
  const formData = new FormData();
  formData.set(name, value);
  return formData;
};

describe("generated customer-account invitation composition", () => {
  it("submits the exported action through the selected provider", async () => {
    vi.stubEnv("COMMERCETOOLS_CLIENT_ID", "test-client");
    vi.stubEnv("COMMERCETOOLS_CLIENT_SECRET", "test-secret");
    vi.stubEnv("COMMERCETOOLS_PROJECT_KEY", "test-project");
    vi.stubEnv("COMMERCETOOLS_REGION", "test-region");
    vi.stubEnv("COMMERCETOOLS_SCOPE", "test-scope");
    vi.stubEnv("STRIPE_PUBLISHABLE_KEY", "pk_test_from_input");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_from_input");
    const {
      cancelCompanyMemberInvitation,
      inviteCompanyMember,
      reissueCompanyMemberInvitation,
      removeCompanyMember,
    } = await import("@repo/commerce/customer-account/actions");
    const { getCustomerAccountOverview } =
      await import("@repo/commerce/customer-account");
    const { NextCommerce } = await import("@repo/commerce/runtime");

    await expect(
      inviteCompanyMember(null, invitationForm())
    ).resolves.toMatchObject({
      _tag: "Success",
      success: {
        invitationId:
          provider.selected === "Clerk"
            ? "clerk-invitation-1"
            : "workos-invitation-1",
        inviteeEmail: "member@example.com",
      },
    });
    expect({
      clerk: provider.clerkCreateInvitation.mock.calls,
      workos: provider.sendInvitation.mock.calls,
    }).toStrictEqual(
      provider.selected === "Clerk"
        ? {
            clerk: [
              [
                expect.objectContaining({
                  emailAddress: "member@example.com",
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
                }),
              ],
            ],
            workos: [],
          }
        : {
            clerk: [],
            workos: [
              [
                {
                  email: "member@example.com",
                  inviterUserId: "auth-admin-1",
                },
              ],
            ],
          }
    );

    const issuedOverview = await NextCommerce.runPromise(
      getCustomerAccountOverview().pipe(NextCommerce.provide("en-US"))
    );
    if (issuedOverview === null) {
      throw new Error("Expected a customer account overview after issuance");
    }
    const [issuedInvitation] = issuedOverview.people.invitations;
    if (issuedInvitation === undefined) {
      throw new Error("Expected the issued invitation in the durable roster");
    }

    await expect(
      cancelCompanyMemberInvitation(
        null,
        managementForm(
          "companyMemberInvitationId",
          issuedInvitation.companyMemberInvitationId
        )
      )
    ).resolves.toMatchObject({
      _tag: "Success",
      success: { operation: "cancel" },
    });
    await expect(
      reissueCompanyMemberInvitation(
        null,
        managementForm(
          "companyMemberInvitationId",
          issuedInvitation.companyMemberInvitationId
        )
      )
    ).resolves.toMatchObject({
      _tag: "Success",
      success: { operation: "reissue" },
    });
    await expect(
      removeCompanyMember(
        null,
        managementForm("customerId", "customer-member-1")
      )
    ).resolves.toMatchObject({
      _tag: "Success",
      success: { operation: "remove" },
    });

    const managedOverview = await NextCommerce.runPromise(
      getCustomerAccountOverview().pipe(NextCommerce.provide("en-US"))
    );
    if (managedOverview === null) {
      throw new Error("Expected a customer account overview after management");
    }
    expect(
      managedOverview.people.members.map(({ customerId }) => customerId)
    ).toStrictEqual(["customer-1"]);
    expect(managedOverview.people.invitations).toMatchObject([
      { status: "pending" },
    ]);
    expect({
      clerkCreates: provider.clerkCreateInvitation.mock.calls.length,
      clerkRevocations: provider.clerkRevokeInvitation.mock.calls,
      workosCreates: provider.sendInvitation.mock.calls.length,
      workosRevocations: provider.workosRevokeInvitation.mock.calls,
    }).toStrictEqual(
      provider.selected === "Clerk"
        ? {
            clerkCreates: 2,
            clerkRevocations: [["clerk-invitation-1"]],
            workosCreates: 0,
            workosRevocations: [],
          }
        : {
            clerkCreates: 0,
            clerkRevocations: [],
            workosCreates: 2,
            workosRevocations: [["workos-invitation-1"]],
          }
    );
  }, 15_000);
});
