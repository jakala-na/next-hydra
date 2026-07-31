import { describe, expect, it } from "@effect/vitest";
import { StoreKey } from "@repo/commerce/domain/cart";
import { CommerceAccount } from "@repo/commerce/domain/commerce-account";
import {
  StoreConflict,
  StoreError,
  VersionedKeyValueStore,
} from "@repo/versioned-store";
import { Effect, Exit, Layer, Redacted } from "effect";
import { RegistrationReviewerActor } from "../domain/actors";
import { ApprovedDecision, RejectedDecision } from "../domain/approval";
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

const storeKey = StoreKey.make("default-store");

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

const makeInvitationId = (_registrationId: RegistrationId) =>
  InvitationId.make("invitation-1");

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

      const created = yield* registrations.createAwaitingApproval({
        details,
        storeKey,
      });
      const loaded = yield* registrations.get(created.id);

      expect(loaded._tag).toBe("AwaitingApprovalRegistration");
      expect(loaded.id).toBe(created.id);
      expect(loaded.storeKey).toBe(storeKey);
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
                  message: `Store insert conflict for ${key}: forced conflict`,
                  key,
                  operation: "insert",
                })
              ),
            update: store.update,
            values: store.values,
          });
        }).pipe(Effect.provide(VersionedKeyValueStore.layerMemory))
      );
      const layer = Registrations.layerStorage.pipe(
        Layer.provide(conflictingStore)
      );

      return Effect.gen(function* () {
        const registrations = yield* Registrations;

        const exit = yield* registrations
          .createAwaitingApproval({ details, storeKey })
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
                  message: `Failed to insert store value ${key}: forced insert failure`,
                  key,
                  operation: "insert",
                  cause: "forced insert failure",
                })
              ),
            update: store.update,
            values: store.values,
          });
        }).pipe(Effect.provide(VersionedKeyValueStore.layerMemory))
      );
      const layer = Registrations.layerStorage.pipe(
        Layer.provide(failingStore)
      );

      return Effect.gen(function* () {
        const registrations = yield* Registrations;

        const exit = yield* registrations
          .createAwaitingApproval({ details, storeKey })
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
              message: `Failed to read store value ${key}: forced read failure`,
              key,
              operation: "read",
              cause: "forced read failure",
            })
          ),
        insert: () => Effect.void,
        update: () => Effect.void,
        values: () =>
          Effect.fail(
            new StoreError({
              message:
                "Failed to read store value registration-1: forced read failure",
              key: "registration-1",
              operation: "read",
              cause: "forced read failure",
            })
          ),
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
      const created = yield* registrations.createAwaitingApproval({
        details,
        storeKey,
      });

      const approved = yield* registrations.markApproved({
        registrationId: created.id,
        decision: makeDecision(),
        commerceAccount: makeCommerceAccount(created.id),
        invitationId: makeInvitationId(created.id),
      });

      expect(approved._tag).toBe("ApprovedRegistration");
      expect(approved.createdAt).toStrictEqual(created.createdAt);
      expect(approved.invitationId).toBe(makeInvitationId(created.id));
    }).pipe(Effect.provide(Registrations.layerMemory))
  );

  it.effect("moves accepted approval decisions into processing", () =>
    Effect.gen(function* () {
      const registrations = yield* Registrations;
      const created = yield* registrations.createAwaitingApproval({
        details,
        storeKey,
      });

      const processing = yield* registrations.markApprovalProcessing({
        registrationId: created.id,
        decision: "approved",
      });

      expect(processing._tag).toBe("ApprovalProcessingRegistration");
      expect(processing.status).toBe("approval_processing");
      if (processing._tag === "ApprovalProcessingRegistration") {
        expect(processing.requestedDecision).toBe("approved");
      }
    }).pipe(Effect.provide(Registrations.layerMemory))
  );

  it.effect("finalizes processing approvals", () =>
    Effect.gen(function* () {
      const registrations = yield* Registrations;
      const created = yield* registrations.createAwaitingApproval({
        details,
        storeKey,
      });
      yield* registrations.markApprovalProcessing({
        registrationId: created.id,
        decision: "approved",
      });

      const approved = yield* registrations.markApproved({
        registrationId: created.id,
        decision: makeDecision(),
        commerceAccount: makeCommerceAccount(created.id),
        invitationId: makeInvitationId(created.id),
      });

      expect(approved._tag).toBe("ApprovedRegistration");
    }).pipe(Effect.provide(Registrations.layerMemory))
  );

  it.effect("finds approved registrations by invitation id", () =>
    Effect.gen(function* () {
      const registrations = yield* Registrations;
      const created = yield* registrations.createAwaitingApproval({
        details,
        storeKey,
      });
      const invitationId = makeInvitationId(created.id);

      yield* registrations.markApproved({
        registrationId: created.id,
        decision: makeDecision(),
        commerceAccount: makeCommerceAccount(created.id),
        invitationId,
      });

      const found = yield* registrations.findByInvitationId(invitationId);

      expect(found.id).toBe(created.id);
      expect(found.invitationId).toBe(invitationId);
    }).pipe(Effect.provide(Registrations.layerMemory))
  );

  it.effect("rejects awaiting registrations", () =>
    Effect.gen(function* () {
      const registrations = yield* Registrations;
      const created = yield* registrations.createAwaitingApproval({
        details,
        storeKey,
      });

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
      const created = yield* registrations.createAwaitingApproval({
        details,
        storeKey,
      });
      yield* registrations.markApproved({
        registrationId: created.id,
        decision: makeDecision(),
        commerceAccount: makeCommerceAccount(created.id),
        invitationId: makeInvitationId(created.id),
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
                message: `Store update conflict for ${key}: forced conflict`,
                key,
                operation: "update",
              })
            ),
          values: store.values,
        });
      }).pipe(Effect.provide(VersionedKeyValueStore.layerMemory))
    );
    const layer = Registrations.layerStorage.pipe(
      Layer.provide(conflictingStore)
    );

    return Effect.gen(function* () {
      const registrations = yield* Registrations;
      const created = yield* registrations.createAwaitingApproval({
        details,
        storeKey,
      });

      const exit = yield* registrations
        .markApproved({
          registrationId: created.id,
          decision: makeDecision(),
          commerceAccount: makeCommerceAccount(created.id),
          invitationId: makeInvitationId(created.id),
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
                  message: `Failed to update store value ${key}: forced update failure`,
                  key,
                  operation: "update",
                  cause: "forced update failure",
                })
              ),
            values: store.values,
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
          storeKey,
        });

        const exit = yield* registrations
          .markApproved({
            registrationId: created.id,
            decision: makeDecision(),
            commerceAccount: makeCommerceAccount(created.id),
            invitationId: makeInvitationId(created.id),
          })
          .pipe(Effect.exit);

        expectDomainPersistenceFailure(exit);
      }).pipe(Effect.provide(layer));
    }
  );
});
