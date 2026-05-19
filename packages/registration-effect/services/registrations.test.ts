import { describe, expect, it } from "@effect/vitest";
import { Effect, Exit, Layer, Redacted } from "effect";
import { RegistrationReviewerActor } from "../domain/actors";
import { ApprovedDecision, RejectedDecision } from "../domain/approval";
import { CommerceAccount } from "../domain/commerce";
import {
  AddressLine,
  AuthUserId,
  City,
  CommerceBusinessUnitId,
  CommerceCustomerId,
  CompanyName,
  CountryCode,
  Email,
  InvitationId,
  PersonName,
  PhoneNumber,
  PostalCode,
  Region,
  RegistrationId,
  VatId,
} from "../domain/identity";
import {
  PendingRegistrationInvitation,
  RegistrationApprovalIntent,
} from "../domain/invitations";
import {
  CompanyAddress,
  CompanyRegistrationDetails,
} from "../domain/registration";
import {
  RegistrationAlreadyExists,
  RegistrationConcurrentModification,
  RegistrationNotFound,
  RegistrationPersistenceFailure,
  Registrations,
  RegistrationTransitionConflict,
} from "./registrations";
import {
  StoreConflict,
  StoreError,
  VersionedKeyValueStore,
} from "./versioned-key-value-store";

const details = new CompanyRegistrationDetails({
  companyName: CompanyName.make("Hydra Supplies"),
  companyPhone: Redacted.make(PhoneNumber.make("+1 555 0100"), {
    label: "companyPhone",
  }),
  vatId: Redacted.make(VatId.make("VAT-123"), { label: "vatId" }),
  contactFirstName: Redacted.make(PersonName.make("Ada"), {
    label: "personName",
  }),
  contactLastName: Redacted.make(PersonName.make("Lovelace"), {
    label: "personName",
  }),
  email: Redacted.make(Email.make("ada@example.com"), { label: "email" }),
  address: new CompanyAddress({
    streetName: Redacted.make(AddressLine.make("1 Computation Way"), {
      label: "addressLine",
    }),
    additionalStreetInfo: Redacted.make(AddressLine.make("Suite 42"), {
      label: "addressLine",
    }),
    postalCode: Redacted.make(PostalCode.make("10001"), {
      label: "postalCode",
    }),
    city: Redacted.make(City.make("New York"), { label: "city" }),
    region: Redacted.make(Region.make("NY"), { label: "region" }),
    country: CountryCode.make("US"),
  }),
});

const reviewer = new RegistrationReviewerActor({
  actorType: "registration_reviewer",
  authUserId: AuthUserId.make("auth-reviewer-1"),
  email: Redacted.make(Email.make("reviewer@example.com"), {
    label: "email",
  }),
  name: "Registration Reviewer",
});

const makeDecision = () =>
  new ApprovedDecision({
    decision: "approved",
    actor: reviewer,
    decidedAt: new Date(1),
  });

const makeRejectedDecision = () =>
  new RejectedDecision({
    decision: "rejected",
    actor: reviewer,
    decidedAt: new Date(1),
  });

const makeCommerceAccount = (registrationId: RegistrationId) =>
  new CommerceAccount({
    registrationId,
    customerId: CommerceCustomerId.make("customer-1"),
    businessUnitId: CommerceBusinessUnitId.make("business-unit-1"),
  });

const makeInvitation = (registrationId: RegistrationId) =>
  new PendingRegistrationInvitation({
    _tag: "PendingInvitation",
    id: InvitationId.make("invitation-1"),
    intent: new RegistrationApprovalIntent({
      intent: "registration_approval",
      registrationId,
      inviteeEmail: details.email,
      role: "owner",
    }),
    issuedBy: reviewer,
    createdAt: new Date(1),
  });

const expectDomainPersistenceFailure = (exit: Exit.Exit<unknown, unknown>) => {
  expect(Exit.isFailure(exit)).toBe(true);
  if (Exit.isFailure(exit)) {
    expect(exit.cause.toString()).toContain(
      RegistrationPersistenceFailure.name
    );
    expect(exit.cause.toString()).not.toContain(StoreError.name);
  }
};

describe("Registrations over versioned storage", () => {
  it.effect("creates and loads awaiting approval registrations", () =>
    Effect.gen(function* () {
      const registrations = yield* Registrations;

      const created = yield* registrations.createAwaitingApproval({ details });
      const loaded = yield* registrations.get(created.id);

      expect(loaded._tag).toBe("AwaitingApprovalRegistration");
      expect(loaded.id).toBe(created.id);
    }).pipe(Effect.provide(Registrations.layerMemory))
  );

  it.effect(
    "maps create storage conflicts to a domain already-exists error",
    () => {
      const conflictingStore = Layer.effect(
        VersionedKeyValueStore,
        Effect.gen(function* () {
          const store = yield* VersionedKeyValueStore;

          return VersionedKeyValueStore.of({
            get: store.get,
            insert: (key) =>
              Effect.fail(
                new StoreConflict({
                  key,
                  operation: "insert",
                  reason: "forced conflict",
                })
              ),
            update: store.update,
          });
        }).pipe(Effect.provide(VersionedKeyValueStore.layerMemory))
      );
      const layer = Registrations.layerStorage.pipe(
        Layer.provide(conflictingStore)
      );

      return Effect.gen(function* () {
        const registrations = yield* Registrations;

        const exit = yield* registrations
          .createAwaitingApproval({ details })
          .pipe(Effect.exit);

        expect(Exit.isFailure(exit)).toBe(true);
        if (Exit.isFailure(exit)) {
          expect(exit.cause.toString()).toContain(
            RegistrationAlreadyExists.name
          );
          expect(exit.cause.toString()).not.toContain(StoreConflict.name);
        }
      }).pipe(Effect.provide(layer));
    }
  );

  it.effect(
    "maps create storage failures to a domain persistence error",
    () => {
      const failingStore = Layer.effect(
        VersionedKeyValueStore,
        Effect.gen(function* () {
          const store = yield* VersionedKeyValueStore;

          return VersionedKeyValueStore.of({
            get: store.get,
            insert: (key) =>
              Effect.fail(
                new StoreError({
                  key,
                  operation: "insert",
                  cause: "forced insert failure",
                })
              ),
            update: store.update,
          });
        }).pipe(Effect.provide(VersionedKeyValueStore.layerMemory))
      );
      const layer = Registrations.layerStorage.pipe(
        Layer.provide(failingStore)
      );

      return Effect.gen(function* () {
        const registrations = yield* Registrations;

        const exit = yield* registrations
          .createAwaitingApproval({ details })
          .pipe(Effect.exit);

        expectDomainPersistenceFailure(exit);
      }).pipe(Effect.provide(layer));
    }
  );

  it.effect("maps read storage failures to a domain persistence error", () => {
    const failingStore = Layer.succeed(
      VersionedKeyValueStore,
      VersionedKeyValueStore.of({
        get: (key) =>
          Effect.fail(
            new StoreError({
              key,
              operation: "read",
              cause: "forced read failure",
            })
          ),
        insert: () => Effect.void,
        update: () => Effect.void,
      })
    );
    const layer = Registrations.layerStorage.pipe(Layer.provide(failingStore));

    return Effect.gen(function* () {
      const registrations = yield* Registrations;

      const exit = yield* registrations
        .get(RegistrationId.make("registration-1"))
        .pipe(Effect.exit);

      expectDomainPersistenceFailure(exit);
    }).pipe(Effect.provide(layer));
  });

  it.effect("fails missing registration lookups with a typed error", () =>
    Effect.gen(function* () {
      const registrations = yield* Registrations;

      const exit = yield* registrations
        .get(RegistrationId.make("missing-registration"))
        .pipe(Effect.exit);

      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        expect(exit.cause.toString()).toContain(RegistrationNotFound.name);
      }
    }).pipe(Effect.provide(Registrations.layerMemory))
  );

  it.effect("approves awaiting registrations", () =>
    Effect.gen(function* () {
      const registrations = yield* Registrations;
      const created = yield* registrations.createAwaitingApproval({ details });

      const approved = yield* registrations.markApproved({
        registrationId: created.id,
        decision: makeDecision(),
        commerceAccount: makeCommerceAccount(created.id),
        invitation: makeInvitation(created.id),
      });

      expect(approved._tag).toBe("ApprovedRegistration");
      expect(approved.createdAt).toStrictEqual(created.createdAt);
    }).pipe(Effect.provide(Registrations.layerMemory))
  );

  it.effect("rejects awaiting registrations", () =>
    Effect.gen(function* () {
      const registrations = yield* Registrations;
      const created = yield* registrations.createAwaitingApproval({ details });

      const rejected = yield* registrations.markRejected({
        registrationId: created.id,
        decision: makeRejectedDecision(),
      });

      expect(rejected._tag).toBe("RejectedRegistration");
      expect(rejected.createdAt).toStrictEqual(created.createdAt);
    }).pipe(Effect.provide(Registrations.layerMemory))
  );

  it.effect("rejects incompatible lifecycle transitions", () =>
    Effect.gen(function* () {
      const registrations = yield* Registrations;
      const created = yield* registrations.createAwaitingApproval({ details });
      yield* registrations.markApproved({
        registrationId: created.id,
        decision: makeDecision(),
        commerceAccount: makeCommerceAccount(created.id),
        invitation: makeInvitation(created.id),
      });

      const exit = yield* registrations
        .markRejected({
          registrationId: created.id,
          decision: makeRejectedDecision(),
        })
        .pipe(Effect.exit);

      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        expect(exit.cause.toString()).toContain(
          RegistrationTransitionConflict.name
        );
      }
    }).pipe(Effect.provide(Registrations.layerMemory))
  );

  it.effect("surfaces concurrent modification without retrying", () => {
    const conflictingStore = Layer.effect(
      VersionedKeyValueStore,
      Effect.gen(function* () {
        const store = yield* VersionedKeyValueStore;

        return VersionedKeyValueStore.of({
          get: store.get,
          insert: store.insert,
          update: (key) =>
            Effect.fail(
              new StoreConflict({
                key,
                operation: "update",
                reason: "forced conflict",
              })
            ),
        });
      }).pipe(Effect.provide(VersionedKeyValueStore.layerMemory))
    );
    const layer = Registrations.layerStorage.pipe(
      Layer.provide(conflictingStore)
    );

    return Effect.gen(function* () {
      const registrations = yield* Registrations;
      const created = yield* registrations.createAwaitingApproval({ details });

      const exit = yield* registrations
        .markApproved({
          registrationId: created.id,
          decision: makeDecision(),
          commerceAccount: makeCommerceAccount(created.id),
          invitation: makeInvitation(created.id),
        })
        .pipe(Effect.exit);

      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        expect(exit.cause.toString()).toContain(
          RegistrationConcurrentModification.name
        );
      }

      const current = yield* registrations.get(created.id);
      expect(current._tag).toBe("AwaitingApprovalRegistration");
    }).pipe(Effect.provide(layer));
  });

  it.effect(
    "maps update storage failures to a domain persistence error",
    () => {
      const failingStore = Layer.effect(
        VersionedKeyValueStore,
        Effect.gen(function* () {
          const store = yield* VersionedKeyValueStore;

          return VersionedKeyValueStore.of({
            get: store.get,
            insert: store.insert,
            update: (key) =>
              Effect.fail(
                new StoreError({
                  key,
                  operation: "update",
                  cause: "forced update failure",
                })
              ),
          });
        }).pipe(Effect.provide(VersionedKeyValueStore.layerMemory))
      );
      const layer = Registrations.layerStorage.pipe(
        Layer.provide(failingStore)
      );

      return Effect.gen(function* () {
        const registrations = yield* Registrations;
        const created = yield* registrations.createAwaitingApproval({
          details,
        });

        const exit = yield* registrations
          .markApproved({
            registrationId: created.id,
            decision: makeDecision(),
            commerceAccount: makeCommerceAccount(created.id),
            invitation: makeInvitation(created.id),
          })
          .pipe(Effect.exit);

        expectDomainPersistenceFailure(exit);
      }).pipe(Effect.provide(layer));
    }
  );
});
