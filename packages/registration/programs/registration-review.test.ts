import { describe, expect, it } from "@effect/vitest";
import { StoreKey } from "@repo/commerce/store";
import { Effect, Exit, Layer, Redacted } from "effect";

import { RegistrationReviewerActor } from "../domain/actors";
import { ApprovedDecision } from "../domain/approval";
import {
  AddressLine,
  AuthUserId,
  City,
  CompanyName,
  CountryCode,
  Email,
  InvitationId,
  PersonName,
  PostalCode,
} from "../domain/identity";
import {
  CompanyAddress,
  CompanyRegistrationDetails,
} from "../domain/registration";
import { RegistrationWorkflow } from "../services/registration-workflow";
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
  address: new CompanyAddress({
    city: Redacted.make(City.make("New York"), { label: "city" }),
    country: CountryCode.make("US"),
    postalCode: Redacted.make(PostalCode.make("10001"), {
      label: "postalCode",
    }),
    streetName: Redacted.make(AddressLine.make("1 Computation Way"), {
      label: "addressLine",
    }),
  }),
  companyName: CompanyName.make("Hydra Supplies"),
  contactFirstName: Redacted.make(PersonName.make("Ada"), {
    label: "personName",
  }),
  contactLastName: Redacted.make(PersonName.make("Lovelace"), {
    label: "personName",
  }),
  email: Redacted.make(Email.make("ada@example.com"), { label: "email" }),
});

const createRegistration = Effect.gen(function* () {
  const registrations = yield* Registrations;
  return yield* registrations.createAwaitingApproval({
    details,
    storeKey: StoreKey.make("default-store"),
  });
});

describe(acceptRegistrationReviewDecision, () => {
  it.effect("marks approval processing before resuming workflow", () => {
    const resumed: unknown[] = [];

    return Effect.gen(function* () {
      const registration = yield* createRegistration;

      const accepted = yield* acceptRegistrationReviewDecision({
        decision: "approved",
        reason: "Looks good",
        registrationId: registration.id,
        reviewer,
      });
      const current = yield* Registrations.pipe(
        Effect.flatMap((registrations) => registrations.get(registration.id))
      );

      expect(accepted.status).toBe("approval_processing");
      expect(current.status).toBe("approval_processing");
      expect(resumed).toStrictEqual([
        {
          decision: {
            decision: "approved",
            reason: "Looks good",
            reviewer: {
              authUserId: "auth-reviewer-1",
              email: "reviewer@example.com",
              name: "Registration Reviewer",
            },
          },
          registrationId: registration.id,
        },
      ]);
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          Registrations.layerMemory,
          Layer.succeed(
            RegistrationWorkflow,
            RegistrationWorkflow.of({
              resumeInvitation: () => Effect.die("not used"),
              resumeReview: (registrationId, decision) =>
                Effect.sync(() => resumed.push({ decision, registrationId })),
              start: () => Effect.die("not used"),
            })
          )
        )
      )
    );
  });

  it.effect("does not resume workflow when the transition conflicts", () => {
    const resumed: unknown[] = [];

    return Effect.gen(function* () {
      const registrations = yield* Registrations;
      const registration = yield* createRegistration;
      yield* registrations.markApprovalProcessing({
        decision: "approved",
        registrationId: registration.id,
      });
      const exit = yield* acceptRegistrationReviewDecision({
        decision: "rejected",
        registrationId: registration.id,
        reviewer,
      }).pipe(Effect.exit);

      expect(Exit.isFailure(exit)).toBeTruthy();
      if (Exit.isFailure(exit)) {
        expect(exit.cause.toString()).toContain(
          RegistrationTransitionConflict.name
        );
      }
      expect(resumed).toStrictEqual([]);
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          Registrations.layerMemory,
          Layer.succeed(
            RegistrationWorkflow,
            RegistrationWorkflow.of({
              resumeInvitation: () => Effect.die("not used"),
              resumeReview: (registrationId, decision) =>
                Effect.sync(() => resumed.push({ decision, registrationId })),
              start: () => Effect.die("not used"),
            })
          )
        )
      )
    );
  });

  it.effect("acknowledges an approval that is already processing", () => {
    const resumed: unknown[] = [];

    return Effect.gen(function* () {
      const registrations = yield* Registrations;
      const registration = yield* createRegistration;
      yield* registrations.markApprovalProcessing({
        decision: "approved",
        registrationId: registration.id,
      });

      const repeated = yield* acceptRegistrationReviewDecision({
        decision: "approved",
        registrationId: registration.id,
        reviewer,
      });

      expect(repeated._tag).toBe("ApprovalProcessingRegistration");
      expect(resumed).toStrictEqual([]);
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          Registrations.layerMemory,
          Layer.succeed(
            RegistrationWorkflow,
            RegistrationWorkflow.of({
              resumeInvitation: () => Effect.die("not used"),
              resumeReview: (registrationId, decision) =>
                Effect.sync(() => resumed.push({ decision, registrationId })),
              start: () => Effect.die("not used"),
            })
          )
        )
      )
    );
  });

  it.effect(
    "does not resume a consumed hook for a completed approval retry",
    () => {
      const resumed: unknown[] = [];

      return Effect.gen(function* () {
        const registrations = yield* Registrations;
        const registration = yield* createRegistration;
        yield* registrations.markApprovalProcessing({
          decision: "approved",
          registrationId: registration.id,
        });
        yield* registrations.markApproved({
          decision: new ApprovedDecision({
            actor: reviewer,
            decidedAt: new Date("2026-03-22T00:00:00.000Z"),
            decision: "approved",
          }),
          invitationId: InvitationId.make("invitation-completed"),
          registrationId: registration.id,
        });

        const repeated = yield* acceptRegistrationReviewDecision({
          decision: "approved",
          registrationId: registration.id,
          reviewer,
        });

        expect(repeated._tag).toBe("ApprovedRegistration");
        expect(resumed).toStrictEqual([]);
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            Registrations.layerMemory,
            Layer.succeed(
              RegistrationWorkflow,
              RegistrationWorkflow.of({
                resumeInvitation: () => Effect.die("not used"),
                resumeReview: (registrationId, decision) =>
                  Effect.sync(() => resumed.push({ decision, registrationId })),
                start: () => Effect.die("not used"),
              })
            )
          )
        )
      );
    }
  );
});
