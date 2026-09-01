import { describe, expect, it } from "@effect/vitest";
import { StoreKey } from "@repo/commerce/store";
import {
  StoreConflict,
  StoreError,
  VersionedKeyValueStore,
} from "@repo/versioned-store";
import { Effect, Exit, Layer, Redacted, Schema } from "effect";
import { vi } from "vitest";

import { RegistrationReviewerActor } from "../domain/actors";
import { ApprovedDecision, RejectedDecision } from "../domain/approval";
import {
  AddressLine,
  AuthUserId,
  City,
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
  ApprovedRegistration,
  CompanyAddress,
  CompanyRegistrationDetails,
} from "../domain/registration";
import {
  RegistrationConcurrentModification,
  RegistrationNotFound,
  RegistrationOnboardingTransitionConflict,
  RegistrationPersistenceFailure,
  Registrations,
  RegistrationTransitionConflict,
} from "./registrations";

const details = new CompanyRegistrationDetails({
  address: new CompanyAddress({
    additionalStreetInfo: Redacted.make(AddressLine.make("Suite 42"), {
      label: "addressLine",
    }),
    city: Redacted.make(City.make("New York"), { label: "city" }),
    country: CountryCode.make("US"),
    postalCode: Redacted.make(PostalCode.make("10001"), {
      label: "postalCode",
    }),
    region: Redacted.make(Region.make("NY"), { label: "region" }),
    streetName: Redacted.make(AddressLine.make("1 Computation Way"), {
      label: "addressLine",
    }),
  }),
  companyName: CompanyName.make("Hydra Supplies"),
  companyPhone: Redacted.make(PhoneNumber.make("+1 555 0100"), {
    label: "companyPhone",
  }),
  contactFirstName: Redacted.make(PersonName.make("Ada"), {
    label: "personName",
  }),
  contactLastName: Redacted.make(PersonName.make("Lovelace"), {
    label: "personName",
  }),
  email: Redacted.make(Email.make("ada@example.com"), { label: "email" }),
  vatId: Redacted.make(VatId.make("VAT-123"), { label: "vatId" }),
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
    actor: reviewer,
    decidedAt: new Date(1),
    decision: "approved",
  });

const makeRejectedDecision = () =>
  new RejectedDecision({
    actor: reviewer,
    decidedAt: new Date(1),
    decision: "rejected",
  });

const makeInvitationId = (_registrationId: RegistrationId) =>
  InvitationId.make("invitation-1");

const expectDomainPersistenceFailure = (exit: Exit.Exit<unknown, unknown>) => {
  expect(Exit.isFailure(exit)).toBeTruthy();
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
    "retries generated registration ID conflicts before defecting",
    () => {
      const insert = vi.fn((key: string) =>
        Effect.fail(
          new StoreConflict({
            key,
            message: `Store insert conflict for ${key}: forced conflict`,
            operation: "insert",
          })
        )
      );
      const conflictingStore = Layer.effect(
        VersionedKeyValueStore,
        Effect.gen(function* () {
          const store = yield* VersionedKeyValueStore;

          return VersionedKeyValueStore.of({
            get: store.get,
            insert,
            remove: store.remove,
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

        expect(Exit.isFailure(exit)).toBeTruthy();
        if (Exit.isFailure(exit)) {
          expect(exit.cause.toString()).toContain(StoreConflict.name);
        }
        expect(insert).toHaveBeenCalledTimes(3);
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
                  cause: "forced insert failure",
                  key,
                  message: `Failed to insert store value ${key}: forced insert failure`,
                  operation: "insert",
                  reason: "unavailable",
                })
              ),
            remove: store.remove,
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

  it.effect("discards an awaiting approval registration idempotently", () =>
    Effect.gen(function* () {
      const registrations = yield* Registrations;
      const created = yield* registrations.createAwaitingApproval({
        details,
        storeKey,
      });

      yield* registrations.discardAwaitingApproval(created.id);
      yield* registrations.discardAwaitingApproval(created.id);

      const missing = yield* registrations.get(created.id).pipe(Effect.exit);
      expect(Exit.isFailure(missing)).toBeTruthy();
      if (Exit.isFailure(missing)) {
        expect(missing.cause.toString()).toContain(RegistrationNotFound.name);
      }
    }).pipe(Effect.provide(Registrations.layerMemory))
  );

  it.effect("maps read storage failures to a domain persistence error", () => {
    const failingStore = Layer.succeed(
      VersionedKeyValueStore,
      VersionedKeyValueStore.of({
        get: (key) =>
          Effect.fail(
            new StoreError({
              cause: "forced read failure",
              key,
              message: `Failed to read store value ${key}: forced read failure`,
              operation: "read",
              reason: "unavailable",
            })
          ),
        insert: () => Effect.void,
        remove: () => Effect.void,
        update: () => Effect.void,
        values: () =>
          Effect.fail(
            new StoreError({
              cause: "forced read failure",
              key: "registration-1",
              message:
                "Failed to read store value registration-1: forced read failure",
              operation: "read",
              reason: "unavailable",
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

      expect(Exit.isFailure(exit)).toBeTruthy();
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
        decision: makeDecision(),
        invitationId: makeInvitationId(created.id),
        registrationId: created.id,
      });

      expect(approved._tag).toBe("ApprovedRegistration");
      expect(approved.createdAt).toStrictEqual(created.createdAt);
      expect(approved.invitationId).toBe(makeInvitationId(created.id));
    }).pipe(Effect.provide(Registrations.layerMemory))
  );

  it.effect("approves a verified registration without an invitation", () =>
    Effect.gen(function* () {
      const registrations = yield* Registrations;
      const submittedByAuthUserId = AuthUserId.make("auth-user-1");
      const created = yield* registrations.createAwaitingApproval({
        details,
        storeKey,
        submittedByAuthUserId,
      });

      const approved = yield* registrations.markApproved({
        acceptedAuthUserId: submittedByAuthUserId,
        decision: makeDecision(),
        registrationId: created.id,
      });

      expect(approved.invitationId).toBeUndefined();
      expect(approved.onboardingStatus).toBe("accepted");
      expect(approved.acceptedAuthUserId).toBe(submittedByAuthUserId);
    }).pipe(Effect.provide(Registrations.layerMemory))
  );

  it.effect("rejects approval evidence for a different auth identity", () =>
    Effect.gen(function* () {
      const registrations = yield* Registrations;
      const created = yield* registrations.createAwaitingApproval({
        details,
        storeKey,
        submittedByAuthUserId: AuthUserId.make("auth-user-1"),
      });

      const failure = yield* registrations
        .markApproved({
          acceptedAuthUserId: AuthUserId.make("auth-user-2"),
          decision: makeDecision(),
          registrationId: created.id,
        })
        .pipe(Effect.flip);

      expect(failure).toBeInstanceOf(RegistrationTransitionConflict);
    }).pipe(Effect.provide(Registrations.layerMemory))
  );

  it.effect("moves accepted approval decisions into processing", () =>
    Effect.gen(function* () {
      const registrations = yield* Registrations;
      const created = yield* registrations.createAwaitingApproval({
        details,
        storeKey,
      });

      const result = yield* registrations.markApprovalProcessing({
        decision: "approved",
        registrationId: created.id,
      });
      const processing = result.registration;

      expect(result.transitioned).toBeTruthy();
      expect(processing._tag).toBe("ApprovalProcessingRegistration");
      expect(processing.status).toBe("approval_processing");
      if (processing._tag === "ApprovalProcessingRegistration") {
        expect(processing.requestedDecision).toBe("approved");
      }
    }).pipe(Effect.provide(Registrations.layerMemory))
  );

  it.effect("keeps Registration onboarding outcomes terminal", () =>
    Effect.gen(function* () {
      const registrations = yield* Registrations;
      const created = yield* registrations.createAwaitingApproval({
        details,
        storeKey,
      });
      const approved = yield* registrations.markApproved({
        decision: makeDecision(),
        invitationId: makeInvitationId(created.id),
        registrationId: created.id,
      });

      const expired = yield* registrations.markOnboardingStatus({
        registrationId: approved.id,
        status: "expired",
      });
      const repeated = yield* registrations.markOnboardingStatus({
        registrationId: approved.id,
        status: "expired",
      });
      const accepted = yield* registrations
        .markOnboardingStatus({
          acceptedAuthUserId: AuthUserId.make("auth-user-1"),
          registrationId: approved.id,
          status: "accepted",
        })
        .pipe(Effect.flip);

      expect(expired.onboardingStatus).toBe("expired");
      expect(repeated.onboardingStatus).toBe("expired");
      expect(accepted).toBeInstanceOf(RegistrationOnboardingTransitionConflict);
    }).pipe(Effect.provide(Registrations.layerMemory))
  );

  it.effect("does not let an accepted Registration change auth users", () =>
    Effect.gen(function* () {
      const registrations = yield* Registrations;
      const created = yield* registrations.createAwaitingApproval({
        details,
        storeKey,
      });
      const approved = yield* registrations.markApproved({
        decision: makeDecision(),
        invitationId: makeInvitationId(created.id),
        registrationId: created.id,
      });
      const acceptedAuthUserId = AuthUserId.make("auth-user-1");

      const accepted = yield* registrations.markOnboardingStatus({
        acceptedAuthUserId,
        registrationId: approved.id,
        status: "accepted",
      });
      const repeated = yield* registrations.markOnboardingStatus({
        acceptedAuthUserId,
        registrationId: approved.id,
        status: "accepted",
      });
      const conflicting = yield* registrations
        .markOnboardingStatus({
          acceptedAuthUserId: AuthUserId.make("auth-user-2"),
          registrationId: approved.id,
          status: "accepted",
        })
        .pipe(Effect.flip);

      expect(accepted.acceptedAuthUserId).toBe(acceptedAuthUserId);
      expect(repeated.acceptedAuthUserId).toBe(acceptedAuthUserId);
      expect(conflicting).toBeInstanceOf(
        RegistrationOnboardingTransitionConflict
      );
    }).pipe(Effect.provide(Registrations.layerMemory))
  );

  it.effect("rejects an accepted Registration without an auth user", () =>
    Effect.gen(function* () {
      const registrations = yield* Registrations;
      const created = yield* registrations.createAwaitingApproval({
        details,
        storeKey,
      });
      const approved = yield* registrations.markApproved({
        decision: makeDecision(),
        invitationId: makeInvitationId(created.id),
        registrationId: created.id,
      });
      const encoded =
        yield* Schema.encodeUnknownEffect(ApprovedRegistration)(approved);
      const decoded = yield* Schema.decodeUnknownEffect(ApprovedRegistration)({
        ...encoded,
        onboarding: { status: "accepted" },
      }).pipe(Effect.exit);

      expect(Exit.isFailure(decoded)).toBeTruthy();
    }).pipe(Effect.provide(Registrations.layerMemory))
  );

  it.effect("rejects approved persisted data without onboarding state", () =>
    Effect.gen(function* () {
      const registrations = yield* Registrations;
      const created = yield* registrations.createAwaitingApproval({
        details,
        storeKey,
      });
      const approved = yield* registrations.markApproved({
        decision: makeDecision(),
        invitationId: makeInvitationId(created.id),
        registrationId: created.id,
      });
      const encoded =
        yield* Schema.encodeUnknownEffect(ApprovedRegistration)(approved);
      const { onboarding: _onboarding, ...legacyApproved } = encoded;
      const decoded = yield* Schema.decodeUnknownEffect(ApprovedRegistration)(
        legacyApproved
      ).pipe(Effect.exit);

      expect(Exit.isFailure(decoded)).toBeTruthy();
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
        decision: "approved",
        registrationId: created.id,
      });

      const approved = yield* registrations.markApproved({
        decision: makeDecision(),
        invitationId: makeInvitationId(created.id),
        registrationId: created.id,
      });

      expect(approved._tag).toBe("ApprovedRegistration");
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
        decision: makeRejectedDecision(),
        registrationId: created.id,
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
        decision: makeDecision(),
        invitationId: makeInvitationId(created.id),
        registrationId: created.id,
      });

      const exit = yield* registrations
        .markRejected({
          decision: makeRejectedDecision(),
          registrationId: created.id,
        })
        .pipe(Effect.exit);

      expect(Exit.isFailure(exit)).toBeTruthy();
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
          remove: store.remove,
          update: (key) =>
            Effect.fail(
              new StoreConflict({
                key,
                message: `Store update conflict for ${key}: forced conflict`,
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
          decision: makeDecision(),
          invitationId: makeInvitationId(created.id),
          registrationId: created.id,
        })
        .pipe(Effect.exit);

      expect(Exit.isFailure(exit)).toBeTruthy();
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
            remove: store.remove,
            update: (key) =>
              Effect.fail(
                new StoreError({
                  cause: "forced update failure",
                  key,
                  message: `Failed to update store value ${key}: forced update failure`,
                  operation: "update",
                  reason: "unavailable",
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
            decision: makeDecision(),
            invitationId: makeInvitationId(created.id),
            registrationId: created.id,
          })
          .pipe(Effect.exit);

        expectDomainPersistenceFailure(exit);
      }).pipe(Effect.provide(layer));
    }
  );
});
