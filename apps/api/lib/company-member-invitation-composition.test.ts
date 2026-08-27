/* oxlint-disable anti-slop/no-chained-type-assertions, anti-slop/no-module-mocking, anti-slop/require-safety-comment-for-type-assertion, typescript/no-unsafe-type-assertion -- This generated-application composition test replaces external persistence and Commerce while retaining the selected auth projection, application runtime, durable invitation repository, and provider-specific acceptance entry point. */
import type { AddAssociateInput } from "@repo/commerce/services/commerce-accounts";
import type { CompanyMemberIdentityProjection as CompanyMemberIdentityProjectionService } from "@repo/registration";
import type { VersionedKeyValueStore } from "@repo/versioned-store";
import { describe, expect, it, vi } from "vitest";

interface CompositionHarness {
  readonly addAssociate: ReturnType<
    typeof vi.fn<(input: AddAssociateInput) => void>
  >;
  selected: "" | "Clerk" | "WorkOS";
  storeService: unknown;
  readonly workosUpdateUser: ReturnType<
    typeof vi.fn<
      (input: {
        readonly metadata: { readonly invitation: string };
        readonly userId: string;
      }) => Promise<void>
    >
  >;
}

const harness = vi.hoisted<CompositionHarness>(() => ({
  addAssociate: vi.fn<(input: AddAssociateInput) => void>(),
  selected: "",
  storeService: undefined,
  workosUpdateUser: vi.fn<
    (input: {
      readonly metadata: { readonly invitation: string };
      readonly userId: string;
    }) => Promise<void>
  >(
    async (_input: {
      readonly metadata: { readonly invitation: string };
      readonly userId: string;
    }) => {
      await Promise.resolve();
    }
  ),
}));

vi.mock(import("@repo/auth/invitations"), async (importOriginal) => {
  const actual = await importOriginal();
  const { CompanyMemberIdentityProjection } =
    await import("@repo/registration");
  const { Layer } = await import("effect");
  const selected = actual as typeof actual & {
    readonly makeWorkosCompanyMemberIdentityProjection?: (api: {
      readonly updateUser: typeof harness.workosUpdateUser;
    }) => CompanyMemberIdentityProjectionService["Service"];
  };

  harness.selected =
    "makeClerkCompanyMemberInvitations" in actual ? "Clerk" : "WorkOS";

  if (selected.makeWorkosCompanyMemberIdentityProjection === undefined) {
    return actual;
  }

  return {
    ...actual,
    companyMemberIdentityProjectionLayer: Layer.succeed(
      CompanyMemberIdentityProjection,
      selected.makeWorkosCompanyMemberIdentityProjection({
        updateUser: harness.workosUpdateUser,
      })
    ),
  };
});

vi.mock(import("@repo/commerce-provider/commerce-accounts"), async () => {
  const { CommerceAssociateMembership, CommerceCustomerId } =
    await import("@repo/commerce/domain/commerce-account");
  const { CommerceAccounts } =
    await import("@repo/commerce/services/commerce-accounts");
  const { Effect, Layer } = await import("effect");

  return {
    commerceAccountsLayer: Layer.succeed(
      CommerceAccounts,
      CommerceAccounts.of({
        addAssociate: (input) => {
          harness.addAssociate(input);
          return Effect.succeed(
            new CommerceAssociateMembership({
              authUserId: input.acceptedIdentity.authUserId,
              businessUnitId: input.businessUnitId,
              customerId: CommerceCustomerId.make(
                `customer-${input.acceptedIdentity.authUserId}`
              ),
              roles: input.roles,
            })
          );
        },
        createFromRegistration: () => Effect.die("not used"),
        getCustomerIdByAuthUserId: () => Effect.die("not used"),
        getCustomerProfile: () => Effect.die("not used"),
        hasCustomerWithEmail: () => Effect.succeed(false),
        linkRegistrantIdentity: () => Effect.die("not used"),
        listBusinessUnitMembershipsForCustomerInStore: () =>
          Effect.die("not used"),
      })
    ),
  };
});

vi.mock(import("@repo/commerce-provider/versioned-store"), async () => {
  const { VersionedKeyValueStore } = await import("@repo/versioned-store");
  const { Effect, Layer, ManagedRuntime } = await import("effect");
  const storeRuntime = ManagedRuntime.make(VersionedKeyValueStore.layerMemory);
  const storeService = await storeRuntime.runPromise(
    Effect.gen(function* () {
      return yield* VersionedKeyValueStore;
    })
  );
  harness.storeService = storeService;

  return {
    versionedKeyValueStoreLayer: () =>
      Layer.succeed(VersionedKeyValueStore, storeService),
  };
});

vi.mock(import("./registration/workflow-runtime"), async () => {
  const {
    RegistrationInvitationIssueAttempts,
    RegistrationQueries,
    Registrations,
    RegistrationWorkflow,
  } = await import("@repo/registration");
  const { Effect, Layer } = await import("effect");

  return {
    registrationInvitationLayer: Layer.mergeAll(
      RegistrationInvitationIssueAttempts.layerMemory,
      RegistrationQueries.layerMemoryFrom([]),
      Registrations.layerMemory,
      Layer.succeed(
        RegistrationWorkflow,
        RegistrationWorkflow.of({
          resumeInvitation: () => Effect.void,
          resumeReview: () => Effect.void,
          start: () => Effect.void,
        })
      )
    ),
  };
});

describe("generated company-member invitation acceptance composition", () => {
  it("accepts through the selected provider and provisions Commerce membership", async () => {
    const {
      AuthUserId,
      CompanyActor,
      CompanyMemberIntent,
      CompanyMemberInvitationId,
      CompanyMemberInvitationRecords,
      Email,
      InvitationId,
      PendingCompanyMemberInvitation,
      PersonName,
    } = await import("@repo/registration");
    const { CommerceBusinessUnitId } =
      await import("@repo/commerce/domain/commerce-account");
    const { VersionedKeyValueStore } = await import("@repo/versioned-store");
    const { Effect, Layer, ManagedRuntime, Redacted } = await import("effect");
    const {
      acceptCompanyMemberInvitationForClerk,
      dispatchWorkosInvitationEvent,
    } = await import("./company-member-invitations/runtime");

    const companyMemberInvitationId = CompanyMemberInvitationId.make(
      "company-member-invitation-composition-1"
    );
    const providerInvitationId = InvitationId.make(
      "provider-invitation-composition-1"
    );
    const businessUnitId = CommerceBusinessUnitId.make(
      "business-unit-composition-1"
    );
    const email = Email.make("member@example.com");
    const acceptedAt = new Date("2026-08-25T12:30:00.000Z");
    const storeService =
      harness.storeService as VersionedKeyValueStore["Service"];
    const recordsRuntime = ManagedRuntime.make(
      CompanyMemberInvitationRecords.layerStorage.pipe(
        Layer.provide(Layer.succeed(VersionedKeyValueStore, storeService))
      )
    );

    await recordsRuntime.runPromise(
      CompanyMemberInvitationRecords.pipe(
        Effect.flatMap((records) =>
          records.recordIssued(
            new PendingCompanyMemberInvitation({
              _tag: "PendingInvitation",
              createdAt: new Date("2026-08-25T12:00:00.000Z"),
              expiresAt: new Date("2026-08-26T12:00:00.000Z"),
              id: providerInvitationId,
              intent: new CompanyMemberIntent({
                businessUnitId,
                companyMemberInvitationId,
                intent: "company_member",
                inviteeEmail: Redacted.make(email, { label: "email" }),
                inviteeName: {
                  firstName: Redacted.make(PersonName.make("Invitation"), {
                    label: "personName",
                  }),
                  lastName: Redacted.make(PersonName.make("Default"), {
                    label: "personName",
                  }),
                },
                roles: ["buyer", "approver"],
              }),
              issuedBy: new CompanyActor({
                actorType: "company",
                authUserId: AuthUserId.make("auth-admin-1"),
                businessUnitId,
                email: Redacted.make(Email.make("admin@example.com"), {
                  label: "email",
                }),
                roles: ["admin", "buyer"],
              }),
            })
          )
        )
      )
    );

    await (harness.selected === "Clerk"
      ? acceptCompanyMemberInvitationForClerk({
          acceptedAt,
          acceptedIdentity: {
            authUserId: AuthUserId.make("auth-member-1"),
            email,
          },
          companyMemberInvitationId,
        })
      : dispatchWorkosInvitationEvent({
          event: {
            acceptedAt,
            acceptedIdentity: {
              authUserId: AuthUserId.make("auth-member-1"),
              email,
            },
            event: "accepted",
          },
          invitationId: providerInvitationId,
        }));

    expect(harness.addAssociate).toHaveBeenCalledOnce();
    const [membershipInput] = harness.addAssociate.mock.calls[0] ?? [];
    expect(
      membershipInput === undefined
        ? undefined
        : {
            businessUnitId: membershipInput.businessUnitId,
            firstName: Redacted.value(
              membershipInput.acceptedIdentity.firstName
            ),
            lastName: Redacted.value(membershipInput.acceptedIdentity.lastName),
            roles: membershipInput.roles,
          }
    ).toStrictEqual({
      businessUnitId,
      firstName: "Invitation",
      lastName: "Default",
      roles: ["buyer", "approver"],
    });
    await expect(
      recordsRuntime.runPromise(
        CompanyMemberInvitationRecords.pipe(
          Effect.flatMap((records) =>
            records.getById(companyMemberInvitationId)
          )
        )
      )
    ).resolves.toMatchObject({
      _tag: "AcceptedInvitation",
      acceptedAt,
      acceptedBy: { authUserId: "auth-member-1" },
    });
    expect(harness.workosUpdateUser.mock.calls).toStrictEqual(
      harness.selected === "WorkOS"
        ? [
            [
              {
                metadata: {
                  invitation:
                    '{"businessUnitId":"business-unit-composition-1","companyMemberInvitationId":"company-member-invitation-composition-1","intent":"company_member","roles":["buyer","approver"]}',
                },
                userId: "auth-member-1",
              },
            ],
            [
              {
                metadata: {
                  membership:
                    '{"businessUnitId":"business-unit-composition-1","roles":["buyer","approver"]}',
                },
                userId: "auth-member-1",
              },
            ],
          ]
        : []
    );
  }, 15_000);
});
