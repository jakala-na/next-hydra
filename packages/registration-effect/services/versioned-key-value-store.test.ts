import { describe, expect, it } from "@effect/vitest";
import { Effect, Exit, Formatter, Option, Redacted, Schema } from "effect";
import { RegistrationReviewerActor } from "../domain/actors";
import { ApprovedDecision } from "../domain/approval";
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
  ApprovedRegistration,
  AwaitingApprovalRegistration,
  CompanyAddress,
  CompanyRegistrationDetails,
  Registration,
} from "../domain/registration";
import {
  StoreConflict,
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

const registrationId = RegistrationId.make("registration-1");
const key = String(registrationId);

const awaiting = new AwaitingApprovalRegistration({
  _tag: "AwaitingApprovalRegistration",
  status: "awaiting_approval",
  id: registrationId,
  details,
  createdAt: new Date(0),
  updatedAt: new Date(0),
});

const makeApproved = (registration: AwaitingApprovalRegistration) =>
  new ApprovedRegistration({
    _tag: "ApprovedRegistration",
    status: "approved",
    id: registration.id,
    details: registration.details,
    decision: new ApprovedDecision({
      decision: "approved",
      actor: reviewer,
      decidedAt: new Date(1),
    }),
    commerceAccount: new CommerceAccount({
      registrationId: registration.id,
      customerId: CommerceCustomerId.make("customer-1"),
      businessUnitId: CommerceBusinessUnitId.make("business-unit-1"),
    }),
    invitation: new PendingRegistrationInvitation({
      _tag: "PendingInvitation",
      id: InvitationId.make("invitation-1"),
      intent: new RegistrationApprovalIntent({
        intent: "registration_approval",
        registrationId: registration.id,
        inviteeEmail: registration.details.email,
        role: "owner",
      }),
      issuedBy: reviewer,
      createdAt: new Date(1),
    }),
    createdAt: registration.createdAt,
    updatedAt: new Date(1),
  });

describe("VersionedKeyValueStore.layerMemory", () => {
  it.effect(
    "keeps redacted fields redacted during formatted JSON logging",
    () =>
      Effect.gen(function* () {
        const storageJson = yield* Schema.encodeEffect(
          Schema.fromJsonString(Schema.toCodecJson(Registration))
        )(awaiting);
        const logJson = Formatter.formatJson(awaiting);

        expect(storageJson).toContain("ada@example.com");
        expect(storageJson).toContain("1 Computation Way");
        expect(logJson).not.toContain("ada@example.com");
        expect(logJson).not.toContain("1 Computation Way");
        expect(logJson).toContain("<redacted:email>");
        expect(logJson).toContain("<redacted:addressLine>");
      })
  );

  it.effect("returns none for missing keys", () =>
    Effect.gen(function* () {
      const store = yield* VersionedKeyValueStore;

      const missing = yield* store.get(key, Registration);

      expect(Option.isNone(missing)).toBe(true);
    }).pipe(Effect.provide(VersionedKeyValueStore.layerMemory))
  );

  it.effect("inserts and decodes schema values by key", () =>
    Effect.gen(function* () {
      const store = yield* VersionedKeyValueStore;

      yield* store.insert(key, Registration, awaiting);
      const stored = yield* store.get(key, Registration);

      expect(Option.isSome(stored)).toBe(true);
      if (Option.isSome(stored)) {
        expect(stored.value.value._tag).toBe("AwaitingApprovalRegistration");
        expect(stored.value.value.id).toBe(awaiting.id);
        expect(stored.value.value.createdAt).toBeInstanceOf(Date);
      }
    }).pipe(Effect.provide(VersionedKeyValueStore.layerMemory))
  );

  it.effect("rejects duplicate create-only inserts", () =>
    Effect.gen(function* () {
      const store = yield* VersionedKeyValueStore;

      yield* store.insert(key, Registration, awaiting);
      const exit = yield* store
        .insert(key, Registration, awaiting)
        .pipe(Effect.exit);

      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        expect(exit.cause.toString()).toContain(StoreConflict.name);
      }
    }).pipe(Effect.provide(VersionedKeyValueStore.layerMemory))
  );

  it.effect("updates with the current version and returns a new version", () =>
    Effect.gen(function* () {
      const store = yield* VersionedKeyValueStore;

      yield* store.insert(key, Registration, awaiting);
      const current = yield* store
        .get(key, Registration)
        .pipe(Effect.flatMap(Effect.fromOption));
      const approved = makeApproved(awaiting);

      yield* store.update(key, Registration, current, approved);
      const updated = yield* store
        .get(key, Registration)
        .pipe(Effect.flatMap(Effect.fromOption));

      expect(updated.value._tag).toBe("ApprovedRegistration");
      expect(updated.version).not.toBe(current.version);
    }).pipe(Effect.provide(VersionedKeyValueStore.layerMemory))
  );

  it.effect("rejects stale versioned updates", () =>
    Effect.gen(function* () {
      const store = yield* VersionedKeyValueStore;

      yield* store.insert(key, Registration, awaiting);
      const stale = yield* store
        .get(key, Registration)
        .pipe(Effect.flatMap(Effect.fromOption));
      yield* store.update(key, Registration, stale, makeApproved(awaiting));

      const exit = yield* store
        .update(key, Registration, stale, makeApproved(awaiting))
        .pipe(Effect.exit);

      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        expect(exit.cause.toString()).toContain(StoreConflict.name);
      }
    }).pipe(Effect.provide(VersionedKeyValueStore.layerMemory))
  );
});
