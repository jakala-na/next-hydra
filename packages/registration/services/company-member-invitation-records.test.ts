import { describe, expect, it } from "@effect/vitest";
import { StoreError, VersionedKeyValueStore } from "@repo/versioned-store";
import { Cause, DateTime, Effect, Exit, Layer, Redacted } from "effect";

import { CompanyActor } from "../domain/actors";
import {
  AuthUserId,
  CompanyMemberInvitationId,
  CommerceBusinessUnitId,
  Email,
  InvitationId,
  PersonName,
} from "../domain/identity";
import {
  CompanyMemberIntent,
  PendingCompanyMemberInvitation,
} from "../domain/invitations";
import { CompanyMemberInvitationRecords } from "./company-member-invitation-records";

const businessUnitId = CommerceBusinessUnitId.make("business-unit-1");
const providerInvitationId = InvitationId.make("provider-invitation-1");
const dateFromMillis = (milliseconds: number) =>
  DateTime.toDateUtc(DateTime.makeUnsafe(milliseconds));
const actor = new CompanyActor({
  actorType: "company",
  authUserId: AuthUserId.make("auth-admin-1"),
  businessUnitId,
  email: Redacted.make(Email.make("admin@example.com"), { label: "email" }),
  roles: ["admin"],
});

const pendingInvitation = (companyMemberInvitationId: string) =>
  new PendingCompanyMemberInvitation({
    _tag: "PendingInvitation",
    createdAt: dateFromMillis(0),
    expiresAt: dateFromMillis(60_000),
    id: providerInvitationId,
    intent: new CompanyMemberIntent({
      businessUnitId,
      companyMemberInvitationId: CompanyMemberInvitationId.make(
        companyMemberInvitationId
      ),
      intent: "company_member",
      inviteeEmail: Redacted.make(Email.make("member@example.com"), {
        label: "email",
      }),
      inviteeName: {
        firstName: Redacted.make(PersonName.make("Invited"), {
          label: "personName",
        }),
        lastName: Redacted.make(PersonName.make("Member"), {
          label: "personName",
        }),
      },
      roles: ["buyer"],
    }),
    issuedBy: actor,
  });

const failingReadLayer = (reason: StoreError["reason"]) =>
  CompanyMemberInvitationRecords.layerStorage.pipe(
    Layer.provide(
      Layer.effect(
        VersionedKeyValueStore,
        VersionedKeyValueStore.pipe(
          Effect.map((store) =>
            VersionedKeyValueStore.of({
              ...store,
              get: (key) =>
                Effect.fail(
                  new StoreError({
                    cause: new Error(`forced ${reason} read failure`),
                    key,
                    message: `Forced ${reason} read failure`,
                    operation: "read",
                    reason,
                  })
                ),
            })
          ),
          Effect.provide(VersionedKeyValueStore.layerMemory)
        )
      )
    )
  );

describe("company member invitation records", () => {
  it.effect(
    "keeps an unavailable store read as a typed persistence failure",
    () =>
      Effect.gen(function* () {
        const records = yield* CompanyMemberInvitationRecords;
        const failure = yield* records
          .getById(CompanyMemberInvitationId.make("invitation-1"))
          .pipe(Effect.flip);

        expect(failure).toMatchObject({
          _tag: "CompanyMemberInvitationPersistenceFailure",
          operation: "read",
          reason: "unavailable",
        });
      }).pipe(Effect.provide(failingReadLayer("unavailable")))
  );

  it.effect("treats invalid persisted invitation data as a defect", () =>
    Effect.gen(function* () {
      const records = yield* CompanyMemberInvitationRecords;
      const exit = yield* records
        .getById(CompanyMemberInvitationId.make("invitation-1"))
        .pipe(Effect.exit);

      expect(Exit.isFailure(exit)).toBeTruthy();
      if (Exit.isFailure(exit)) {
        expect(Cause.hasDies(exit.cause)).toBeTruthy();
        expect(exit.cause.toString()).not.toContain(
          "CompanyMemberInvitationPersistenceFailure"
        );
      }
    }).pipe(Effect.provide(failingReadLayer("invalidData")))
  );

  it.effect(
    "treats duplicate provider invitation correlation as a defect",
    () =>
      Effect.gen(function* () {
        const records = yield* CompanyMemberInvitationRecords;
        yield* records.recordIssued(pendingInvitation("invitation-1"));
        yield* records.recordIssued(pendingInvitation("invitation-2"));

        const exit = yield* records
          .getByProviderInvitationId(providerInvitationId)
          .pipe(Effect.exit);

        expect(Exit.isFailure(exit)).toBeTruthy();
        if (Exit.isFailure(exit)) {
          expect(Cause.hasDies(exit.cause)).toBeTruthy();
        }
      }).pipe(Effect.provide(CompanyMemberInvitationRecords.layerMemory))
  );
});
