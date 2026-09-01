import { describe, expect, it } from "@effect/vitest";
import {
  CommerceAccounts,
  CommerceCustomerEmailConflict,
} from "@repo/commerce/services/commerce-accounts";
import { StoreKey } from "@repo/commerce/store";
import { StoreConflict, VersionedKeyValueStore } from "@repo/versioned-store";
import { Effect, Layer, Redacted } from "effect";

import { CompanyActor } from "../domain/actors";
import {
  AcceptedAuthIdentity,
  AddressLine,
  AuthUserId,
  City,
  CompanyMemberInvitationId,
  CompanyName,
  CommerceBusinessUnitId,
  CountryCode,
  Email,
  InvitationId,
  PersonName,
  PostalCode,
} from "../domain/identity";
import {
  CompanyMemberIntent,
  PendingCompanyMemberInvitation,
} from "../domain/invitations";
import { CompanyMemberIdentityProjection } from "../services/company-member-identity-projection";
import { CompanyMemberInvitationRecords } from "../services/company-member-invitation-records";
import { acceptCompanyMemberInvitation } from "./company-member-onboarding";

const businessUnitId = CommerceBusinessUnitId.make(
  "business-unit-registration-1"
);
const companyMemberInvitationId = CompanyMemberInvitationId.make(
  "company-member-invitation-1"
);
const providerInvitationId = InvitationId.make("provider-invitation-1");
const inviteeEmail = Redacted.make(Email.make("member@example.com"), {
  label: "email",
});
const inviteeName = {
  firstName: Redacted.make(PersonName.make("Invitation"), {
    label: "personName",
  }),
  lastName: Redacted.make(PersonName.make("Default"), {
    label: "personName",
  }),
};
const acceptedIdentity = new AcceptedAuthIdentity({
  authUserId: AuthUserId.make("auth-member-1"),
  email: inviteeEmail,
  firstName: Redacted.make(PersonName.make("Invited"), {
    label: "personName",
  }),
  lastName: Redacted.make(PersonName.make("Member"), {
    label: "personName",
  }),
});
const acceptedIdentityEvidence = {
  authUserId: acceptedIdentity.authUserId,
  email: Redacted.value(acceptedIdentity.email),
  firstName: Redacted.value(acceptedIdentity.firstName),
  lastName: Redacted.value(acceptedIdentity.lastName),
};
const acceptedIdentityEvidenceWithoutNames = {
  authUserId: acceptedIdentity.authUserId,
  email: Redacted.value(acceptedIdentity.email),
};
const administrator = new CompanyActor({
  actorType: "company",
  authUserId: AuthUserId.make("auth-admin-1"),
  businessUnitId,
  email: Redacted.make(Email.make("admin@example.com"), { label: "email" }),
  roles: ["admin", "buyer"],
});

const layer = Layer.mergeAll(
  CompanyMemberInvitationRecords.layerMemory,
  Layer.succeed(CompanyMemberIdentityProjection, {
    projectAcceptedInvitation: () => Effect.void,
    projectMembership: () => Effect.void,
    removeMembership: () => Effect.void,
  }),
  CommerceAccounts.layerMemory
);

const conflictAfterCommitStoreLayer = Layer.effect(
  VersionedKeyValueStore,
  Effect.gen(function* () {
    const store = yield* VersionedKeyValueStore;

    return VersionedKeyValueStore.of({
      get: store.get,
      insert: store.insert,
      remove: store.remove,
      update: (key, schema, current, next) =>
        store.update(key, schema, current, next).pipe(
          Effect.andThen(
            Effect.fail(
              new StoreConflict({
                key,
                message: `Store update conflict for ${key}: response lost after commit`,
                operation: "update",
              })
            )
          )
        ),
      values: store.values,
    });
  }).pipe(Effect.provide(VersionedKeyValueStore.layerMemory))
);

const conflictAfterCommitLayer = Layer.mergeAll(
  CompanyMemberInvitationRecords.layerStorage.pipe(
    Layer.provide(conflictAfterCommitStoreLayer)
  ),
  Layer.succeed(CompanyMemberIdentityProjection, {
    projectAcceptedInvitation: () => Effect.void,
    projectMembership: () => Effect.void,
    removeMembership: () => Effect.void,
  }),
  CommerceAccounts.layerMemory
);

const customerClaimRaceCommerceLayer = Layer.effect(
  CommerceAccounts,
  Effect.gen(function* () {
    const accounts = yield* CommerceAccounts;

    return CommerceAccounts.of({
      ...accounts,
      addAssociate: () =>
        Effect.fail(
          new CommerceCustomerEmailConflict({
            message: "Another customer claimed the invited email",
          })
        ),
      hasCustomerWithEmail: () => Effect.succeed(false),
    });
  }).pipe(Effect.provide(CommerceAccounts.layerMemory))
);

const customerClaimRaceLayer = Layer.mergeAll(
  CompanyMemberInvitationRecords.layerMemory,
  Layer.succeed(CompanyMemberIdentityProjection, {
    projectAcceptedInvitation: () => Effect.void,
    projectMembership: () => Effect.void,
    removeMembership: () => Effect.void,
  }),
  customerClaimRaceCommerceLayer
);

const prepareInvitation = Effect.gen(function* () {
  const accounts = yield* CommerceAccounts;
  const account = yield* accounts.createFromRegistration({
    _tag: "ApprovedRegistration",
    details: {
      address: {
        city: Redacted.make(City.make("London"), { label: "city" }),
        country: CountryCode.make("GB"),
        postalCode: Redacted.make(PostalCode.make("SW1A 1AA"), {
          label: "postalCode",
        }),
        streetName: Redacted.make(AddressLine.make("1 Example Street"), {
          label: "addressLine",
        }),
      },
      companyName: CompanyName.make("Example Company"),
      contactFirstName: Redacted.make(PersonName.make("Admin"), {
        label: "personName",
      }),
      contactLastName: Redacted.make(PersonName.make("User"), {
        label: "personName",
      }),
      email: administrator.email,
    },
    id: "registration-1",
    storeKey: StoreKey.make("default-store"),
  });
  const records = yield* CompanyMemberInvitationRecords;
  yield* records.recordIssued(
    new PendingCompanyMemberInvitation({
      _tag: "PendingInvitation",
      createdAt: new Date(0),
      expiresAt: new Date(60_000),
      id: providerInvitationId,
      intent: new CompanyMemberIntent({
        businessUnitId: account.businessUnitId,
        companyMemberInvitationId,
        intent: "company_member",
        inviteeEmail,
        inviteeName,
        roles: ["buyer", "approver"],
      }),
      issuedBy: administrator,
    })
  );

  return account;
});

describe("company member onboarding", () => {
  it.effect(
    "creates the customer and all requested business-unit associations after provider acceptance",
    () =>
      Effect.gen(function* () {
        const account = yield* prepareInvitation;
        expect(account.businessUnitId).toBe(businessUnitId);

        const membership = yield* acceptCompanyMemberInvitation({
          acceptedAt: new Date(59_000),
          acceptedIdentity: acceptedIdentityEvidenceWithoutNames,
          reference: {
            providerInvitationId,
            referenceType: "provider_invitation",
          },
        });

        expect(membership).toMatchObject({
          authUserId: "auth-member-1",
          businessUnitId,
          roles: ["buyer", "approver"],
        });

        const records = yield* CompanyMemberInvitationRecords;
        const accepted = yield* records.getById(companyMemberInvitationId);
        expect(accepted._tag).toBe("AcceptedInvitation");
        if (accepted._tag === "AcceptedInvitation") {
          expect(Redacted.value(accepted.acceptedBy.firstName)).toBe(
            "Invitation"
          );
          expect(Redacted.value(accepted.acceptedBy.lastName)).toBe("Default");
          expect(accepted.provisionedMembership).toMatchObject({
            customerId: membership.customerId,
          });
        }
      }).pipe(Effect.provide(layer))
  );

  it.effect("prefers provider profile names over invitation defaults", () =>
    Effect.gen(function* () {
      yield* prepareInvitation;
      yield* acceptCompanyMemberInvitation({
        acceptedAt: new Date(59_000),
        acceptedIdentity: acceptedIdentityEvidence,
        reference: {
          companyMemberInvitationId,
          referenceType: "company_member_invitation",
        },
      });

      const records = yield* CompanyMemberInvitationRecords;
      const accepted = yield* records.getById(companyMemberInvitationId);
      expect(accepted._tag).toBe("AcceptedInvitation");
      if (accepted._tag === "AcceptedInvitation") {
        expect(Redacted.value(accepted.acceptedBy.firstName)).toBe("Invited");
        expect(Redacted.value(accepted.acceptedBy.lastName)).toBe("Member");
      }
    }).pipe(Effect.provide(layer))
  );

  it.effect(
    "keeps the first provider names when an acceptance replay omits them",
    () =>
      Effect.gen(function* () {
        yield* prepareInvitation;
        const first = yield* acceptCompanyMemberInvitation({
          acceptedAt: new Date(59_000),
          acceptedIdentity: acceptedIdentityEvidence,
          reference: {
            companyMemberInvitationId,
            referenceType: "company_member_invitation" as const,
          },
        });
        const accounts = yield* CommerceAccounts;
        const replay = yield* acceptCompanyMemberInvitation({
          acceptedAt: new Date(59_500),
          acceptedIdentity: acceptedIdentityEvidenceWithoutNames,
          reference: {
            companyMemberInvitationId,
            referenceType: "company_member_invitation" as const,
          },
        }).pipe(
          Effect.provideService(
            CommerceAccounts,
            CommerceAccounts.of({
              ...accounts,
              addAssociate: () =>
                Effect.die(
                  "A completed invitation replay must not restore a removed membership"
                ),
            })
          )
        );

        expect(replay).toStrictEqual(first);
        const customerId = yield* accounts.getCustomerIdByAuthUserId(
          acceptedIdentity.authUserId
        );
        const profile = yield* accounts.getCustomerProfile(customerId);
        if (profile.firstName === undefined || profile.lastName === undefined) {
          return yield* Effect.die("Expected the accepted customer names");
        }
        expect(Redacted.value(profile.firstName)).toBe("Invited");
        expect(Redacted.value(profile.lastName)).toBe("Member");
        return undefined;
      }).pipe(Effect.provide(layer))
  );

  it.effect(
    "rejects acceptance when the invited email became a Commerce customer",
    () =>
      Effect.gen(function* () {
        yield* prepareInvitation;
        const accounts = yield* CommerceAccounts;
        yield* accounts.addAssociate({
          acceptedIdentity,
          businessUnitId,
          roles: ["buyer"],
        });

        const failure = yield* acceptCompanyMemberInvitation({
          acceptedAt: new Date(59_000),
          acceptedIdentity: acceptedIdentityEvidence,
          reference: {
            companyMemberInvitationId,
            referenceType: "company_member_invitation",
          },
        }).pipe(Effect.flip);

        expect(failure._tag).toBe("InvitationConflict");
        expect(failure.message).toContain("Commerce customer already exists");
      }).pipe(Effect.provide(layer))
  );

  it.effect(
    "uses provider acceptance time instead of webhook processing time",
    () =>
      Effect.gen(function* () {
        yield* prepareInvitation;

        const membership = yield* acceptCompanyMemberInvitation({
          acceptedAt: new Date(59_999),
          acceptedIdentity: acceptedIdentityEvidence,
          reference: {
            companyMemberInvitationId,
            referenceType: "company_member_invitation",
          },
        });

        expect(membership.authUserId).toBe(acceptedIdentity.authUserId);
      }).pipe(Effect.provide(layer))
  );

  it.effect(
    "accepts timely provider evidence after local expiration was observed",
    () =>
      Effect.gen(function* () {
        yield* prepareInvitation;
        const records = yield* CompanyMemberInvitationRecords;
        yield* records.markExpired({
          companyMemberInvitationId,
          expiredAt: new Date(60_000),
        });

        const membership = yield* acceptCompanyMemberInvitation({
          acceptedAt: new Date(59_999),
          acceptedIdentity: acceptedIdentityEvidence,
          reference: {
            companyMemberInvitationId,
            referenceType: "company_member_invitation",
          },
        });
        const accepted = yield* records.getById(companyMemberInvitationId);

        expect(membership.authUserId).toBe(acceptedIdentity.authUserId);
        expect(accepted._tag).toBe("AcceptedInvitation");
      }).pipe(Effect.provide(layer))
  );

  it.effect("rejects provider acceptance after expiration", () =>
    Effect.gen(function* () {
      yield* prepareInvitation;

      const failure = yield* acceptCompanyMemberInvitation({
        acceptedAt: new Date(60_000),
        acceptedIdentity: acceptedIdentityEvidence,
        reference: {
          companyMemberInvitationId,
          referenceType: "company_member_invitation",
        },
      }).pipe(Effect.flip);

      expect(failure._tag).toBe("InvitationExpired");
      const records = yield* CompanyMemberInvitationRecords;
      const expired = yield* records.getById(companyMemberInvitationId);
      expect(expired._tag).toBe("ExpiredInvitation");
    }).pipe(Effect.provide(layer))
  );

  it.effect(
    "acknowledges acceptance when another webhook commits the same identity first",
    () =>
      Effect.gen(function* () {
        yield* prepareInvitation;
        const records = yield* CompanyMemberInvitationRecords;

        const accepted = yield* records.markAccepted({
          acceptedAt: new Date(1),
          acceptedIdentity,
          companyMemberInvitationId,
        });

        expect(accepted._tag).toBe("AcceptedInvitation");
        expect(accepted.acceptedBy.authUserId).toBe(
          acceptedIdentity.authUserId
        );
      }).pipe(Effect.provide(conflictAfterCommitLayer))
  );

  it.effect(
    "preserves a typed conflict when another customer wins the claim race",
    () =>
      Effect.gen(function* () {
        yield* prepareInvitation;
        const input = {
          acceptedAt: new Date(59_000),
          acceptedIdentity: acceptedIdentityEvidence,
          reference: {
            companyMemberInvitationId,
            referenceType: "company_member_invitation" as const,
          },
        };

        const first = yield* acceptCompanyMemberInvitation(input).pipe(
          Effect.flip
        );
        const retry = yield* acceptCompanyMemberInvitation(input).pipe(
          Effect.flip
        );

        expect(first._tag).toBe("CommerceCustomerEmailConflict");
        expect(retry._tag).toBe("CommerceCustomerEmailConflict");
        const records = yield* CompanyMemberInvitationRecords;
        const invitation = yield* records.getById(companyMemberInvitationId);
        expect(invitation).toMatchObject({
          _tag: "AcceptedInvitation",
          acceptedBy: { authUserId: acceptedIdentity.authUserId },
        });
      }).pipe(Effect.provide(customerClaimRaceLayer))
  );
});
