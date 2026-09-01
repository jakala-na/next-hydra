import { describe, expect, it } from "@effect/vitest";
import {
  CommerceAssociateMembership,
  CommerceCustomerId,
} from "@repo/commerce/domain/commerce-account";
import {
  CommerceAccounts,
  CommerceCustomerEmailConflict,
} from "@repo/commerce/services/commerce-accounts";
import { StoreConflict, VersionedKeyValueStore } from "@repo/versioned-store";
import { DateTime, Effect, Exit, Layer, Redacted, Ref } from "effect";
import { TestClock } from "effect/testing";

import { CompanyActor } from "../domain/actors";
import {
  AuthUserId,
  CompanyMemberInvitationId,
  CommerceBusinessUnitId,
  Email,
  InvitationId,
  PersonName,
} from "../domain/identity";
import { InvitationDelivery, PendingInvitation } from "../domain/invitations";
import { CompanyInvitationPolicy } from "../services/company-invitation-policy";
import { CompanyMemberIdentityProjection } from "../services/company-member-identity-projection";
import { CompanyMemberInvitationRecords } from "../services/company-member-invitation-records";
import { IdentityUsers } from "../services/identity-users";
import {
  CompanyMemberInvitations,
  InvitationDeliveries,
  InvitationNotFound,
  InvitationProviderFailure,
  invitationCapabilitiesLayerMemory,
} from "../services/invitations";
import type { CompanyMemberInvitationIssueInput } from "../services/invitations";
import {
  addCompanyMember,
  issueCompanyMemberInvite,
  listCompanyMemberInvitations,
  reissueCompanyMemberInvite,
  revokeCompanyMemberInvite,
} from "./company-member-invitations";

const identityProjectionLayer = Layer.succeed(
  CompanyMemberIdentityProjection,
  CompanyMemberIdentityProjection.of({
    projectAcceptedInvitation: () => Effect.void,
    projectMembership: () => Effect.void,
    removeMembership: () => Effect.void,
  })
);

const layerMemory = Layer.mergeAll(
  invitationCapabilitiesLayerMemory,
  CompanyInvitationPolicy.layer,
  CompanyMemberInvitationRecords.layerMemory,
  CommerceAccounts.layerMemory,
  identityProjectionLayer,
  IdentityUsers.layerMemory
);

const existingCustomerLayer = Layer.effect(
  CommerceAccounts,
  CommerceAccounts.pipe(
    Effect.map((accounts) =>
      CommerceAccounts.of({
        ...accounts,
        addAssociate: () =>
          Effect.fail(
            new CommerceCustomerEmailConflict({
              message:
                "A Commerce customer already owns the invited identity or email",
            })
          ),
        hasCustomerWithEmail: () => Effect.succeed(true),
      })
    )
  )
).pipe(Layer.provide(CommerceAccounts.layerMemory));

const existingCustomerInvitationLayer = Layer.mergeAll(
  invitationCapabilitiesLayerMemory,
  CompanyInvitationPolicy.layer,
  CompanyMemberInvitationRecords.layerMemory,
  existingCustomerLayer,
  IdentityUsers.layerMemory
);

const inviteeEmail = Redacted.make(Email.make("member@example.com"), {
  label: "email",
});

const retryableReissueInvitationsLayer = Layer.effect(
  CompanyMemberInvitations,
  Effect.gen(function* () {
    const attempts = yield* Ref.make(0);

    return CompanyMemberInvitations.of({
      issue: Effect.fn("TestCompanyMemberInvitations.issue")(function* (input) {
        const attempt = yield* Ref.getAndUpdate(attempts, (count) => count + 1);
        if (attempt === 1) {
          return yield* new InvitationProviderFailure({
            cause: new Error("provider rejected this attempt"),
            message: "Provider rejected this invitation attempt",
            operation: "issue",
          });
        }

        const createdAtDateTime = yield* DateTime.now;
        const createdAt = DateTime.toDateUtc(createdAtDateTime);
        return new PendingInvitation({
          _tag: "PendingInvitation",
          createdAt,
          expiresAt: DateTime.toDateUtc(
            DateTime.add(createdAtDateTime, { days: 30 })
          ),
          id: InvitationId.make(`provider-invitation-${attempt}`),
          intent: input.intent,
          issuedBy: input.issuedBy,
        });
      }),
      revoke: () => Effect.die("not used"),
    });
  })
);

const retryableReissueLayer = Layer.mergeAll(
  retryableReissueInvitationsLayer,
  Layer.succeed(
    InvitationDeliveries,
    InvitationDeliveries.of({
      get: (invitationId) =>
        DateTime.now.pipe(
          Effect.map(
            (now) =>
              new InvitationDelivery({
                createdAt: DateTime.toDateUtc(
                  DateTime.subtract(now, { days: 31 })
                ),
                expiresAt: DateTime.toDateUtc(now),
                id: invitationId,
                inviteeEmail,
                status: "expired",
                updatedAt: DateTime.toDateUtc(now),
              })
          )
        ),
    })
  ),
  CompanyInvitationPolicy.layer,
  CompanyMemberInvitationRecords.layerMemory,
  CommerceAccounts.layerMemory,
  IdentityUsers.layerMemory
);

const missingExpiredDeliveryLayer = Layer.mergeAll(
  Layer.succeed(
    CompanyMemberInvitations,
    CompanyMemberInvitations.of({
      issue: (input) =>
        DateTime.now.pipe(
          Effect.map(
            (now) =>
              new PendingInvitation({
                _tag: "PendingInvitation",
                createdAt: DateTime.toDateUtc(now),
                expiresAt: DateTime.toDateUtc(DateTime.add(now, { days: 30 })),
                id: InvitationId.make(
                  `provider-${input.intent.companyMemberInvitationId}`
                ),
                intent: input.intent,
                issuedBy: input.issuedBy,
              })
          )
        ),
      revoke: () => Effect.die("not used"),
    })
  ),
  Layer.succeed(
    InvitationDeliveries,
    InvitationDeliveries.of({
      get: (invitationId) =>
        Effect.fail(
          new InvitationNotFound({
            invitationId,
            message: `Invitation ${invitationId} was purged by the provider`,
          })
        ),
    })
  ),
  CompanyInvitationPolicy.layer,
  CompanyMemberInvitationRecords.layerMemory,
  CommerceAccounts.layerMemory,
  IdentityUsers.layerMemory
);

const acceptedBeforeReissueLayer = Layer.mergeAll(
  Layer.succeed(
    CompanyMemberInvitations,
    CompanyMemberInvitations.of({
      issue: (input) =>
        DateTime.now.pipe(
          Effect.map(
            (now) =>
              new PendingInvitation({
                _tag: "PendingInvitation",
                createdAt: DateTime.toDateUtc(now),
                expiresAt: DateTime.toDateUtc(DateTime.add(now, { days: 30 })),
                id: InvitationId.make("provider-invitation-accepted"),
                intent: input.intent,
                issuedBy: input.issuedBy,
              })
          )
        ),
      revoke: () => Effect.die("not used"),
    })
  ),
  Layer.succeed(
    InvitationDeliveries,
    InvitationDeliveries.of({
      get: (invitationId) =>
        DateTime.now.pipe(
          Effect.map(
            (now) =>
              new InvitationDelivery({
                createdAt: DateTime.toDateUtc(
                  DateTime.subtract(now, { days: 31 })
                ),
                expiresAt: DateTime.toDateUtc(
                  DateTime.subtract(now, { days: 1 })
                ),
                id: invitationId,
                inviteeEmail,
                status: "accepted",
                updatedAt: DateTime.toDateUtc(now),
              })
          )
        ),
    })
  ),
  CompanyInvitationPolicy.layer,
  CompanyMemberInvitationRecords.layerMemory,
  CommerceAccounts.layerMemory,
  IdentityUsers.layerMemory
);

const releaseConflictStoreLayer = Layer.effect(
  VersionedKeyValueStore,
  Effect.gen(function* () {
    const store = yield* VersionedKeyValueStore;
    const updateCount = yield* Ref.make(0);

    return VersionedKeyValueStore.of({
      get: store.get,
      insert: store.insert,
      remove: store.remove,
      update: (key, schema, current, next) =>
        Ref.getAndUpdate(updateCount, (count) => count + 1).pipe(
          Effect.flatMap((count) =>
            count === 2
              ? Effect.fail(
                  new StoreConflict({
                    key,
                    message: "Forced release contention",
                    operation: "update",
                  })
                )
              : store.update(key, schema, current, next)
          )
        ),
      values: store.values,
    });
  }).pipe(Effect.provide(VersionedKeyValueStore.layerMemory))
);

const releaseConflictLayer = Layer.mergeAll(
  invitationCapabilitiesLayerMemory,
  CompanyInvitationPolicy.layer,
  CompanyMemberInvitationRecords.layerStorage.pipe(
    Layer.provide(releaseConflictStoreLayer)
  ),
  CommerceAccounts.layerMemory,
  IdentityUsers.layerMemory
);

const businessUnitId = CommerceBusinessUnitId.make("business-unit-1");
const inviteeName = {
  firstName: Redacted.make(PersonName.make("Invited"), {
    label: "personName",
  }),
  lastName: Redacted.make(PersonName.make("Member"), {
    label: "personName",
  }),
};

const administrator = new CompanyActor({
  actorType: "company",
  authUserId: AuthUserId.make("auth-admin-1"),
  businessUnitId,
  email: Redacted.make(Email.make("admin@example.com"), { label: "email" }),
  roles: ["admin", "buyer"],
});

const buyer = new CompanyActor({
  actorType: "company",
  authUserId: AuthUserId.make("auth-buyer-1"),
  businessUnitId,
  email: Redacted.make(Email.make("existing-member@example.com"), {
    label: "email",
  }),
  roles: ["buyer"],
});

describe("company member invitations", () => {
  it.effect(
    "provisions an existing identity without issuing a provider invitation",
    () => {
      const projected: AuthUserId[] = [];
      const existingIdentityUsers = IdentityUsers.layerMemoryFrom(
        [],
        [
          {
            authUserId: AuthUserId.make("auth-member-1"),
            email: inviteeEmail,
            firstName: Redacted.make(PersonName.make("Provider"), {
              label: "personName",
            }),
            lastName: Redacted.make(PersonName.make("Profile"), {
              label: "personName",
            }),
            name: "Provider Profile",
          },
        ]
      );
      const directCommerceLayer = Layer.effect(
        CommerceAccounts,
        CommerceAccounts.pipe(
          Effect.map((accounts) =>
            CommerceAccounts.of({
              ...accounts,
              addAssociate: (input) =>
                Effect.succeed(
                  new CommerceAssociateMembership({
                    authUserId: input.acceptedIdentity.authUserId,
                    businessUnitId: input.businessUnitId,
                    customerId: CommerceCustomerId.make("customer-member-1"),
                    roles: input.roles,
                  })
                ),
            })
          )
        )
      ).pipe(Layer.provide(CommerceAccounts.layerMemory));
      const directProjectionLayer = Layer.succeed(
        CompanyMemberIdentityProjection,
        CompanyMemberIdentityProjection.of({
          projectAcceptedInvitation: () => Effect.void,
          projectMembership: (input) =>
            Effect.sync(() => {
              projected.push(input.authUserId);
            }),
          removeMembership: () => Effect.void,
        })
      );
      const directLayer = Layer.mergeAll(
        invitationCapabilitiesLayerMemory,
        CompanyInvitationPolicy.layer,
        CompanyMemberInvitationRecords.layerMemory,
        directCommerceLayer,
        directProjectionLayer,
        existingIdentityUsers
      );

      return Effect.gen(function* () {
        const result = yield* addCompanyMember({
          actor: administrator,
          inviteeEmail,
          inviteeName,
          roles: ["buyer", "approver"],
        });
        const records = yield* CompanyMemberInvitationRecords;
        const invitations = yield* records.listByBusinessUnit(businessUnitId);

        expect(result).toMatchObject({
          _tag: "CompanyMemberProvisioned",
          membership: {
            authUserId: "auth-member-1",
            customerId: "customer-member-1",
            roles: ["buyer", "approver"],
          },
        });
        expect(invitations).toStrictEqual([]);
        expect(projected).toStrictEqual(["auth-member-1"]);
      }).pipe(Effect.provide(directLayer));
    }
  );

  it.effect(
    "rejects an existing identity that already has a Commerce customer",
    () => {
      const existingIdentityUsers = IdentityUsers.layerMemoryFrom(
        [],
        [
          {
            authUserId: AuthUserId.make("auth-member-1"),
            email: inviteeEmail,
            name: "Invited Member",
          },
        ]
      );
      const directLayer = Layer.mergeAll(
        invitationCapabilitiesLayerMemory,
        CompanyInvitationPolicy.layer,
        CompanyMemberInvitationRecords.layerMemory,
        existingCustomerLayer,
        identityProjectionLayer,
        existingIdentityUsers
      );

      return Effect.gen(function* () {
        const failure = yield* addCompanyMember({
          actor: administrator,
          inviteeEmail,
          inviteeName,
          roles: ["buyer"],
        }).pipe(Effect.flip);

        expect(failure).toMatchObject({
          _tag: "CommerceCustomerEmailConflict",
          message:
            "A Commerce customer already owns the invited identity or email",
        });
      }).pipe(Effect.provide(directLayer));
    }
  );

  it.effect("allows an administrator to issue a multi-role invitation", () =>
    Effect.gen(function* () {
      const invitation = yield* issueCompanyMemberInvite({
        actor: administrator,
        inviteeEmail,
        inviteeName,
        roles: ["buyer", "approver"],
      });

      expect(invitation).toMatchObject({
        _tag: "PendingInvitation",
        issuedBy: administrator,
      });
      expect(invitation.intent.intent).toBe("company_member");
      if (invitation.intent.intent !== "company_member") {
        throw new Error("Expected a company member invitation");
      }
      expect(invitation.intent.businessUnitId).toBe(businessUnitId);
      expect(Redacted.value(invitation.intent.inviteeEmail)).toBe(
        Redacted.value(inviteeEmail)
      );
      expect(invitation.intent.roles).toStrictEqual(["buyer", "approver"]);
    }).pipe(Effect.provide(layerMemory))
  );

  it.effect("rejects non-administrators attempting to issue invitations", () =>
    Effect.gen(function* () {
      const exit = yield* issueCompanyMemberInvite({
        actor: buyer,
        inviteeEmail,
        inviteeName,
        roles: ["buyer"],
      }).pipe(Effect.exit);

      expect(Exit.isFailure(exit)).toBeTruthy();
      if (Exit.isFailure(exit)) {
        expect(exit.cause.toString()).toContain("InvitationPolicyError");
      }
    }).pipe(Effect.provide(layerMemory))
  );

  it.effect("rejects invitations to the administrator's own email", () =>
    Effect.gen(function* () {
      const failure = yield* issueCompanyMemberInvite({
        actor: administrator,
        inviteeEmail: Redacted.make(Email.make("ADMIN@example.com"), {
          label: "email",
        }),
        inviteeName,
        roles: ["buyer"],
      }).pipe(Effect.flip);

      expect(failure._tag).toBe("InvitationConflict");
    }).pipe(Effect.provide(layerMemory))
  );

  it.effect(
    "rejects an existing Commerce customer before provider issuance",
    () =>
      Effect.gen(function* () {
        const failure = yield* issueCompanyMemberInvite({
          actor: administrator,
          inviteeEmail,
          inviteeName,
          roles: ["buyer"],
        }).pipe(Effect.flip);

        expect(failure._tag).toBe("InvitationConflict");
        expect(failure.message).toContain("Commerce customer already exists");
      }).pipe(Effect.provide(existingCustomerInvitationLayer))
  );

  it.effect("rejects a duplicate invitation with the same role set", () =>
    Effect.gen(function* () {
      yield* issueCompanyMemberInvite({
        actor: administrator,
        inviteeEmail,
        inviteeName,
        roles: ["buyer", "approver"],
      });
      const failure = yield* issueCompanyMemberInvite({
        actor: administrator,
        inviteeEmail,
        inviteeName,
        roles: ["approver", "buyer"],
      }).pipe(Effect.flip);

      expect(failure._tag).toBe("InvitationConflict");
    }).pipe(Effect.provide(layerMemory))
  );

  it.effect("rejects a duplicate invitation with a different role set", () =>
    Effect.gen(function* () {
      yield* issueCompanyMemberInvite({
        actor: administrator,
        inviteeEmail,
        inviteeName,
        roles: ["buyer"],
      });

      const failure = yield* issueCompanyMemberInvite({
        actor: administrator,
        inviteeEmail,
        inviteeName,
        roles: ["approver"],
      }).pipe(Effect.flip);

      expect(failure._tag).toBe("InvitationConflict");
    }).pipe(Effect.provide(layerMemory))
  );

  it.effect(
    "revokes the provider delivery and durable invitation idempotently",
    () =>
      Effect.gen(function* () {
        const issued = yield* issueCompanyMemberInvite({
          actor: administrator,
          inviteeEmail,
          inviteeName,
          roles: ["buyer"],
        });
        const input = {
          actor: administrator,
          companyMemberInvitationId: issued.intent.companyMemberInvitationId,
        };

        const first = yield* revokeCompanyMemberInvite(input);
        const replay = yield* revokeCompanyMemberInvite(input);
        const delivery = yield* InvitationDeliveries.pipe(
          Effect.flatMap((invitations) => invitations.get(issued.id))
        );

        expect(first._tag).toBe("RevokedInvitation");
        expect(replay).toStrictEqual(first);
        expect(delivery.status).toBe("revoked");
      }).pipe(Effect.provide(layerMemory))
  );

  it.effect("rejects revocation by a non-administrator", () =>
    Effect.gen(function* () {
      const issued = yield* issueCompanyMemberInvite({
        actor: administrator,
        inviteeEmail,
        inviteeName,
        roles: ["buyer"],
      });

      const failure = yield* revokeCompanyMemberInvite({
        actor: buyer,
        companyMemberInvitationId: issued.intent.companyMemberInvitationId,
      }).pipe(Effect.flip);
      const records = yield* CompanyMemberInvitationRecords;
      const durable = yield* records.getById(
        issued.intent.companyMemberInvitationId
      );

      expect(failure._tag).toBe("InvitationPolicyError");
      expect(durable._tag).toBe("PendingInvitation");
    }).pipe(Effect.provide(layerMemory))
  );

  it.effect(
    "materializes expiration and reissues as a fresh durable invitation",
    () =>
      Effect.gen(function* () {
        const issued = yield* issueCompanyMemberInvite({
          actor: administrator,
          inviteeEmail,
          inviteeName,
          roles: ["buyer", "approver"],
        });

        yield* TestClock.adjust("31 days");
        const [expired] = yield* listCompanyMemberInvitations({
          actor: administrator,
        });
        if (expired === undefined) {
          throw new Error("Expected the expired invitation");
        }
        const invitations = yield* CompanyMemberInvitations;
        const issuedInputs = yield* Ref.make<
          readonly CompanyMemberInvitationIssueInput[]
        >([]);
        const recordingInvitations = CompanyMemberInvitations.of({
          ...invitations,
          issue: (input) =>
            Ref.update(issuedInputs, (inputs) => [...inputs, input]).pipe(
              Effect.andThen(invitations.issue(input))
            ),
        });
        const reissued = yield* reissueCompanyMemberInvite({
          actor: administrator,
          companyMemberInvitationId: issued.intent.companyMemberInvitationId,
        }).pipe(
          Effect.provideService(CompanyMemberInvitations, recordingInvitations)
        );
        const replay = yield* reissueCompanyMemberInvite({
          actor: administrator,
          companyMemberInvitationId: issued.intent.companyMemberInvitationId,
        });
        const records = yield* CompanyMemberInvitationRecords;
        const original = yield* records.getById(
          issued.intent.companyMemberInvitationId
        );
        const all = yield* records.listByBusinessUnit(businessUnitId);
        const [providerInput] = yield* Ref.get(issuedInputs);

        expect({
          expired: expired._tag,
          original: original._tag,
          reissued: reissued._tag,
          replacementFor: providerInput?.replacesInvitationId,
        }).toStrictEqual({
          expired: "ExpiredInvitation",
          original: "ExpiredInvitation",
          reissued: "PendingInvitation",
          replacementFor: issued.id,
        });
        expect(reissued.id).not.toBe(issued.id);
        expect(replay).toStrictEqual(reissued);
        expect(reissued.intent.companyMemberInvitationId).not.toBe(
          issued.intent.companyMemberInvitationId
        );
        expect(all).toHaveLength(2);
      }).pipe(Effect.provide(layerMemory))
  );

  it.effect("claims one replacement across concurrent reissue requests", () =>
    Effect.gen(function* () {
      const issued = yield* issueCompanyMemberInvite({
        actor: administrator,
        inviteeEmail,
        inviteeName,
        roles: ["buyer"],
      });
      yield* TestClock.adjust("31 days");
      yield* listCompanyMemberInvitations({ actor: administrator });
      const input = {
        actor: administrator,
        companyMemberInvitationId: issued.intent.companyMemberInvitationId,
      };

      const results = yield* Effect.all(
        [
          reissueCompanyMemberInvite(input).pipe(Effect.exit),
          reissueCompanyMemberInvite(input).pipe(Effect.exit),
        ],
        { concurrency: "unbounded" }
      );
      const records = yield* CompanyMemberInvitationRecords;
      const stored = yield* records.listByBusinessUnit(businessUnitId);

      expect(stored).toHaveLength(2);
      expect(results.some(Exit.isSuccess)).toBeTruthy();
      for (const result of results) {
        if (Exit.isFailure(result)) {
          expect(result.cause.toString()).toContain(
            "InvitationIssueOutcomeUnknown"
          );
        }
      }
    }).pipe(Effect.provide(layerMemory))
  );

  it.effect(
    "does not reissue an invitation accepted before a delayed webhook",
    () =>
      Effect.gen(function* () {
        const issued = yield* issueCompanyMemberInvite({
          actor: administrator,
          inviteeEmail,
          inviteeName,
          roles: ["buyer"],
        });
        yield* TestClock.adjust("31 days");
        yield* listCompanyMemberInvitations({ actor: administrator });

        const failure = yield* reissueCompanyMemberInvite({
          actor: administrator,
          companyMemberInvitationId: issued.intent.companyMemberInvitationId,
        }).pipe(Effect.flip);
        const records = yield* CompanyMemberInvitationRecords;

        expect(failure._tag).toBe("InvitationConflict");
        expect(failure.message).toContain("accepted");
        expect(
          yield* records.listByBusinessUnit(administrator.businessUnitId)
        ).toHaveLength(1);
      }).pipe(Effect.provide(acceptedBeforeReissueLayer))
  );

  it.effect("reissues an expired invitation purged by the provider", () =>
    Effect.gen(function* () {
      const issued = yield* issueCompanyMemberInvite({
        actor: administrator,
        inviteeEmail,
        inviteeName,
        roles: ["buyer"],
      });
      yield* TestClock.adjust("31 days");
      yield* listCompanyMemberInvitations({ actor: administrator });

      const replacement = yield* reissueCompanyMemberInvite({
        actor: administrator,
        companyMemberInvitationId: issued.intent.companyMemberInvitationId,
      });

      expect(replacement._tag).toBe("PendingInvitation");
      expect(replacement.intent.companyMemberInvitationId).not.toBe(
        issued.intent.companyMemberInvitationId
      );
    }).pipe(Effect.provide(missingExpiredDeliveryLayer))
  );

  it.effect("releases a reissue claim after proven provider rejection", () =>
    Effect.gen(function* () {
      const issued = yield* issueCompanyMemberInvite({
        actor: administrator,
        inviteeEmail,
        inviteeName,
        roles: ["buyer"],
      });
      yield* TestClock.adjust("31 days");
      yield* listCompanyMemberInvitations({ actor: administrator });
      const input = {
        actor: administrator,
        companyMemberInvitationId: issued.intent.companyMemberInvitationId,
      };

      const rejected = yield* reissueCompanyMemberInvite(input).pipe(
        Effect.flip
      );
      const retried = yield* reissueCompanyMemberInvite(input);
      const records = yield* CompanyMemberInvitationRecords;
      const original = yield* records.getById(
        issued.intent.companyMemberInvitationId
      );
      const expiredOriginal = yield* original._tag === "ExpiredInvitation"
        ? Effect.succeed(original)
        : Effect.die(
            new Error("Expected the original invitation to remain expired")
          );

      expect(rejected._tag).toBe("InvitationProviderFailure");
      expect(retried._tag).toBe("PendingInvitation");
      expect(expiredOriginal.replacementCompanyMemberInvitationId).toBe(
        retried.intent.companyMemberInvitationId
      );
    }).pipe(Effect.provide(retryableReissueLayer))
  );

  it.effect("retries a contended reissue claim release", () =>
    Effect.gen(function* () {
      const issued = yield* issueCompanyMemberInvite({
        actor: administrator,
        inviteeEmail,
        inviteeName,
        roles: ["buyer"],
      });
      yield* TestClock.adjust("31 days");
      yield* listCompanyMemberInvitations({ actor: administrator });
      const records = yield* CompanyMemberInvitationRecords;
      const replacementCompanyMemberInvitationId =
        CompanyMemberInvitationId.make("replacement-after-contention");

      yield* records.claimReissue({
        companyMemberInvitationId: issued.intent.companyMemberInvitationId,
        replacementCompanyMemberInvitationId,
      });
      yield* records.releaseReissueClaim({
        companyMemberInvitationId: issued.intent.companyMemberInvitationId,
        replacementCompanyMemberInvitationId,
      });

      const original = yield* records.getById(
        issued.intent.companyMemberInvitationId
      );
      expect(original._tag).toBe("ExpiredInvitation");
      if (original._tag === "ExpiredInvitation") {
        expect(original.replacementCompanyMemberInvitationId).toBeUndefined();
      }
    }).pipe(Effect.provide(releaseConflictLayer))
  );
});
