import { describe, expect, it } from "@effect/vitest";
import { Effect, Exit, Redacted } from "effect";
import { RegistrationReviewerActor } from "../domain/actors";
import {
  AddressLine,
  AuthUserId,
  City,
  CompanyName,
  CountryCode,
  Email,
  PersonName,
  PostalCode,
} from "../domain/identity";
import {
  CompanyAddress,
  CompanyRegistrationDetails,
} from "../domain/registration";
import {
  Registrations,
  RegistrationTransitionConflict,
} from "../services/registrations";
import { acceptRegistrationReviewDecision } from "./registration-review";

const reviewer = new RegistrationReviewerActor({
  actorType: "registration_reviewer",
  authUserId: AuthUserId.make("auth-reviewer-1"),
  email: Redacted.make(Email.make("reviewer@example.com"), {
    label: "email",
  }),
  name: "Registration Reviewer",
});

const details = new CompanyRegistrationDetails({
  companyName: CompanyName.make("Hydra Supplies"),
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
    postalCode: Redacted.make(PostalCode.make("10001"), {
      label: "postalCode",
    }),
    city: Redacted.make(City.make("New York"), { label: "city" }),
    country: CountryCode.make("US"),
  }),
});

const createRegistration = Effect.gen(function* () {
  const registrations = yield* Registrations;
  return yield* registrations.createAwaitingApproval({ details });
});

describe("acceptRegistrationReviewDecision", () => {
  it.effect("marks approval processing before resuming workflow", () =>
    Effect.gen(function* () {
      const registration = yield* createRegistration;
      const resumed: unknown[] = [];

      const accepted = yield* acceptRegistrationReviewDecision({
        decision: "approved",
        reason: "Looks good",
        registrationId: registration.id,
        resumeWorkflow: (registrationId, decision) =>
          Effect.sync(() => resumed.push({ decision, registrationId })),
        reviewer,
      });
      const current = yield* Registrations.pipe(
        Effect.flatMap((registrations) => registrations.get(registration.id))
      );

      expect(accepted.status).toBe("approval_processing");
      expect(current.status).toBe("approval_processing");
      expect(resumed).toEqual([
        {
          registrationId: registration.id,
          decision: {
            decision: "approved",
            reason: "Looks good",
            reviewer: {
              authUserId: "auth-reviewer-1",
              email: "reviewer@example.com",
              name: "Registration Reviewer",
            },
          },
        },
      ]);
    }).pipe(Effect.provide(Registrations.layerMemory))
  );

  it.effect("does not resume workflow when the transition conflicts", () =>
    Effect.gen(function* () {
      const registrations = yield* Registrations;
      const registration = yield* createRegistration;
      yield* registrations.markApprovalProcessing({
        decision: "approved",
        registrationId: registration.id,
      });
      const resumed: unknown[] = [];

      const exit = yield* acceptRegistrationReviewDecision({
        decision: "rejected",
        registrationId: registration.id,
        resumeWorkflow: (registrationId, decision) =>
          Effect.sync(() => resumed.push({ decision, registrationId })),
        reviewer,
      }).pipe(Effect.exit);

      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        expect(exit.cause.toString()).toContain(
          RegistrationTransitionConflict.name
        );
      }
      expect(resumed).toEqual([]);
    }).pipe(Effect.provide(Registrations.layerMemory))
  );
});
