/* oxlint-disable anti-slop/no-chained-type-assertions, anti-slop/no-module-mocking, anti-slop/require-safety-comment-for-type-assertion, eslint/require-await, typescript/no-unsafe-argument, typescript/no-unsafe-assignment, typescript/no-unsafe-type-assertion, vitest/no-conditional-expect -- This application-composition test must replace fixed external application bindings while preserving the real generated action, app runtime, Registration adapter, and selected auth-provider factory. The selected @repo/auth package is validated against the two supported factory shapes before use, and the conditional expected value asserts the provider-specific SDK call without conditionally skipping an assertion. */
import type { CompanyMemberInvitations } from "@repo/registration";
import { describe, expect, it, vi } from "vitest";

interface ProviderHarnessState {
  readonly clerkCreateInvitation: ReturnType<
    typeof vi.fn<
      (input: {
        readonly emailAddress: string;
        readonly publicMetadata: unknown;
      }) => Promise<{
        readonly createdAt: number;
        readonly emailAddress: string;
        readonly id: string;
        readonly publicMetadata: unknown;
        readonly status: "pending";
        readonly updatedAt: number;
        readonly url: string;
      }>
    >
  >;
  selected: "" | "Clerk" | "WorkOS";
  readonly sendInvitation: ReturnType<
    typeof vi.fn<
      (input: { readonly email: string }) => Promise<{
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
        readonly revokedAt: null;
        readonly state: "pending";
        readonly token: string;
        readonly updatedAt: string;
      }>
    >
  >;
}

const provider = vi.hoisted<ProviderHarnessState>(() => ({
  clerkCreateInvitation: vi.fn<
    (input: {
      readonly emailAddress: string;
      readonly publicMetadata: unknown;
    }) => Promise<{
      readonly createdAt: number;
      readonly emailAddress: string;
      readonly id: string;
      readonly publicMetadata: unknown;
      readonly status: "pending";
      readonly updatedAt: number;
      readonly url: string;
    }>
  >(async (input) => ({
    createdAt: Date.parse("2026-08-25T12:00:00.000Z"),
    emailAddress: input.emailAddress,
    id: "clerk-invitation-1",
    publicMetadata: input.publicMetadata,
    status: "pending" as const,
    updatedAt: Date.parse("2026-08-25T12:00:00.000Z"),
    url: "https://clerk.example.test/invitations/accept",
  })),
  selected: "",
  sendInvitation: vi.fn<
    (input: { readonly email: string }) => Promise<{
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
      readonly revokedAt: null;
      readonly state: "pending";
      readonly token: string;
      readonly updatedAt: string;
    }>
  >(async (input) => ({
    acceptInvitationUrl: "https://workos.example.test/invitations/accept",
    acceptedAt: null,
    acceptedUserId: null,
    createdAt: "2026-08-25T12:00:00.000Z",
    email: input.email,
    expiresAt: "2026-09-24T12:00:00.000Z",
    id: "workos-invitation-1",
    inviterUserId: "auth-admin-1",
    object: "invitation",
    organizationId: null,
    revokedAt: null,
    state: "pending",
    token: "token-1",
    updatedAt: "2026-08-25T12:00:00.000Z",
  })),
}));

interface SelectedAuthInvitationFactories {
  readonly makeClerkCompanyMemberInvitations?: (
    api: {
      readonly createInvitation: typeof provider.clerkCreateInvitation;
      readonly getInvitationList: () => Promise<{ readonly data: never[] }>;
      readonly revokeInvitation: () => Promise<never>;
    },
    redirectUrl: string
  ) => CompanyMemberInvitations["Service"];
  readonly makeWorkosCompanyMemberInvitations?: (api: {
    readonly getInvitation: () => Promise<never>;
    readonly revokeInvitation: () => Promise<never>;
    readonly sendInvitation: typeof provider.sendInvitation;
  }) => CompanyMemberInvitations["Service"];
}

vi.mock(import("@repo/auth/invitations"), async (importOriginal) => {
  const actual = await importOriginal();
  const { CompanyMemberInvitations } = await import("@repo/registration");
  const { Layer } = await import("effect");
  const selected = actual as unknown as typeof actual &
    SelectedAuthInvitationFactories;

  if (selected.makeClerkCompanyMemberInvitations !== undefined) {
    provider.selected = "Clerk";
    return {
      ...actual,
      companyMemberInvitationsLayer: Layer.succeed(
        CompanyMemberInvitations,
        selected.makeClerkCompanyMemberInvitations(
          {
            createInvitation: provider.clerkCreateInvitation,
            getInvitationList: async () => await Promise.resolve({ data: [] }),
            revokeInvitation: async () =>
              await Promise.reject(new Error("not used")),
          },
          "https://shop.example.test/accept-invitation"
        )
      ),
    };
  }

  if (selected.makeWorkosCompanyMemberInvitations === undefined) {
    throw new Error(
      "The selected auth provider does not expose a company invitation factory"
    );
  }
  provider.selected = "WorkOS";

  return {
    ...actual,
    companyMemberInvitationsLayer: Layer.succeed(
      CompanyMemberInvitations,
      selected.makeWorkosCompanyMemberInvitations({
        getInvitation: async () =>
          await Promise.reject(new Error("not used in this test")),
        revokeInvitation: async () =>
          await Promise.reject(new Error("not used in this test")),
        sendInvitation: provider.sendInvitation,
      })
    ),
  };
});

vi.mock(import("@repo/commerce-provider/provider"), async (importOriginal) => {
  const actual = await importOriginal();
  const {
    CommerceBusinessUnitId,
    CommerceBusinessUnitKey,
    CommerceBusinessUnitLabel,
    CommerceCustomerId,
    CommerceCustomerProfile,
  } = await import("@repo/commerce/domain/commerce-account");
  const { AuthUserId } =
    await import("@repo/commerce/domain/commerce-request-context");
  const { AddressBook } = await import("@repo/commerce/services/address-book");
  const { Carts } = await import("@repo/commerce/services/carts");
  const { CommerceAccounts } =
    await import("@repo/commerce/services/commerce-accounts");
  const { ProductDiscovery } = await import("@repo/commerce/product");
  const { StoreKey } = await import("@repo/commerce/store");
  const { Redacted } = await import("effect");

  const customerId = CommerceCustomerId.make("customer-1");

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
    productDiscoveryLayer: ProductDiscovery.testLayer(),
  };
});

vi.mock(import("@repo/commerce-provider/versioned-store"), async () => {
  const { VersionedKeyValueStore } = await import("@repo/versioned-store");
  return {
    versionedKeyValueStoreLayer: () => VersionedKeyValueStore.layerMemory,
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

describe("generated customer-account invitation composition", () => {
  it("submits the exported action through the selected provider", async () => {
    vi.stubEnv("COMMERCETOOLS_CLIENT_ID", "test-client");
    vi.stubEnv("COMMERCETOOLS_CLIENT_SECRET", "test-secret");
    vi.stubEnv("COMMERCETOOLS_PROJECT_KEY", "test-project");
    vi.stubEnv("COMMERCETOOLS_REGION", "test-region");
    vi.stubEnv("COMMERCETOOLS_SCOPE", "test-scope");
    const { inviteCompanyMember } =
      await import("@repo/commerce/customer-account/actions");

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
  });
});
