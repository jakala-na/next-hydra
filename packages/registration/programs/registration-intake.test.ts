import { describe, expect, it } from "@effect/vitest";
import {
  CommerceAccountUnavailable,
  type CommerceAccountRegistrationInput,
  CommerceAccounts,
} from "@repo/commerce/services/commerce-accounts";
import { StoreKey } from "@repo/commerce/store";
import { Context, Effect, Exit, Layer, Redacted } from "effect";

import {
  AddressLine,
  City,
  CompanyName,
  CountryCode,
  Email,
  PersonName,
  PostalCode,
  VatId,
} from "../domain/identity";
import {
  AwaitingApprovalRegistration,
  CompanyAddress,
  CompanyRegistrationDetails,
} from "../domain/registration";
import { IdentityUsers } from "../services/identity-users";
import { RegistrationMarketPolicy } from "../services/registration-market-policy";
import {
  RegistrationQueries,
  type RegistrationQueryRecord,
} from "../services/registration-queries";
import {
  RegistrationWorkflow,
  RegistrationWorkflowStartUnavailable,
} from "../services/registration-workflow";
import { Registrations } from "../services/registrations";
import { VatValidator } from "../services/vat-validator";
import {
  DuplicateRegistrationEmail,
  InvalidRegistrationVatId,
  RegistrationIntakeValidationError,
  submitRegistrationForReview,
  UnsupportedRegistrationCountry,
} from "./registration-intake";

const details = ({
  companyName = "Hydra Supplies",
  country = "US",
  email = "ada@example.com",
  vatId,
}: {
  readonly companyName?: string;
  readonly country?: string;
  readonly email?: string;
  readonly vatId?: string;
} = {}) =>
  new CompanyRegistrationDetails({
    companyName: CompanyName.make(companyName),
    ...(vatId
      ? {
          vatId: Redacted.make(VatId.make(vatId), { label: "vatId" }),
        }
      : {}),
    contactFirstName: Redacted.make(PersonName.make("Ada"), {
      label: "personName",
    }),
    contactLastName: Redacted.make(PersonName.make("Lovelace"), {
      label: "personName",
    }),
    email: Redacted.make(Email.make(email), { label: "email" }),
    address: new CompanyAddress({
      streetName: Redacted.make(AddressLine.make("1 Computation Way"), {
        label: "addressLine",
      }),
      postalCode: Redacted.make(PostalCode.make("10001"), {
        label: "postalCode",
      }),
      city: Redacted.make(City.make("New York"), { label: "city" }),
      country: CountryCode.make(country),
    }),
  });

const record = (
  registration: AwaitingApprovalRegistration
): RegistrationQueryRecord => ({
  id: String(registration.id),
  registration,
  createdAt: registration.createdAt,
  lastModifiedAt: registration.updatedAt,
});

const makeAwaiting = (email: string) =>
  new AwaitingApprovalRegistration({
    _tag: "AwaitingApprovalRegistration",
    status: "awaiting_approval",
    id: "registration-existing" as AwaitingApprovalRegistration["id"],
    storeKey: StoreKey.make("default-store"),
    details: details({ email }),
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  });

const commerceAccountsLayer = ({
  failure,
  hasCustomerWithEmail = false,
}: {
  readonly failure?: CommerceAccountUnavailable;
  readonly hasCustomerWithEmail?: boolean;
} = {}) =>
  Layer.succeed(
    CommerceAccounts,
    CommerceAccounts.of({
      getCustomerProfile: () => Effect.die("not used"),
      addAssociate: () => Effect.die("not used"),
      createFromRegistration: (
        _registration: CommerceAccountRegistrationInput
      ) => Effect.die("not used"),
      getCustomerIdByAuthUserId: () => Effect.die("not used"),
      hasCustomerWithEmail: () =>
        failure ? Effect.fail(failure) : Effect.succeed(hasCustomerWithEmail),
      listBusinessUnitMembershipsForCustomerInStore: () =>
        Effect.die("not used"),
      linkRegistrantIdentity: () => Effect.die("not used"),
    })
  );

const layerWithRecords = (
  records: readonly RegistrationQueryRecord[],
  {
    commerceFailure,
    hasCustomerWithEmail = false,
    identityEmails = [],
    invalidVatIds = [],
    supportedCountries = ["US"],
    workflow = RegistrationWorkflow.of({
      resumeInvitation: () => Effect.die("not used"),
      resumeReview: () => Effect.die("not used"),
      start: () => Effect.void,
    }),
  }: {
    readonly commerceFailure?: CommerceAccountUnavailable;
    readonly hasCustomerWithEmail?: boolean;
    readonly identityEmails?: readonly string[];
    readonly invalidVatIds?: readonly string[];
    readonly supportedCountries?: readonly string[];
    readonly workflow?: Context.Service.Shape<typeof RegistrationWorkflow>;
  } = {}
) =>
  Layer.mergeAll(
    Registrations.layerMemory,
    Layer.succeed(RegistrationWorkflow, workflow),
    RegistrationQueries.layerMemoryFrom(records),
    commerceAccountsLayer({
      hasCustomerWithEmail,
      ...(commerceFailure === undefined ? {} : { failure: commerceFailure }),
    }),
    IdentityUsers.layerMemoryFrom(
      identityEmails.map((email) =>
        Redacted.make(Email.make(email), { label: "email" })
      )
    ),
    RegistrationMarketPolicy.layerMemoryFrom({
      supportedCountries: supportedCountries.map((country) =>
        CountryCode.make(country)
      ),
    }),
    VatValidator.layerMemoryFrom({ invalidVatIds })
  );

describe("submitRegistrationForReview", () => {
  it.effect(
    "creates an awaiting approval Registration when eligibility passes",
    () =>
      Effect.gen(function* () {
        const registration = yield* submitRegistrationForReview({
          details: details(),
          storeKey: StoreKey.make("de-fr-uk"),
        });

        expect(registration._tag).toBe("AwaitingApprovalRegistration");
        expect(registration.details.companyName).toBe(
          CompanyName.make("Hydra Supplies")
        );
        expect(registration.storeKey).toBe("de-fr-uk");
      }).pipe(Effect.provide(layerWithRecords([])))
  );

  it.effect(
    "discards the registration when the workflow cannot be started",
    () => {
      const workflowFailure = new RegistrationWorkflowStartUnavailable({
        cause: new Error("workflow queue unavailable"),
        message: "Registration workflow could not be started",
        registrationId:
          "registration-pending" as AwaitingApprovalRegistration["id"],
      });
      const workflow = RegistrationWorkflow.of({
        resumeInvitation: () => Effect.die("not used"),
        resumeReview: () => Effect.die("not used"),
        start: (registrationId) =>
          Effect.fail(
            new RegistrationWorkflowStartUnavailable({
              cause: workflowFailure.cause,
              message: workflowFailure.message,
              registrationId,
            })
          ),
      });

      return Effect.gen(function* () {
        const error = yield* submitRegistrationForReview({
          details: details(),
          storeKey: StoreKey.make("default-store"),
        }).pipe(Effect.flip);
        const registrations = yield* Registrations;

        expect(error).toBeInstanceOf(RegistrationWorkflowStartUnavailable);
        if (!(error instanceof RegistrationWorkflowStartUnavailable)) {
          return yield* Effect.die("Expected workflow start failure");
        }
        const persisted = yield* registrations
          .get(error.registrationId)
          .pipe(Effect.exit);
        expect(Exit.isFailure(persisted)).toBe(true);
      }).pipe(Effect.provide(layerWithRecords([], { workflow })));
    }
  );

  it.effect("discards the registration when workflow start defects", () => {
    let startedRegistrationId: AwaitingApprovalRegistration["id"] | undefined;
    const workflow = RegistrationWorkflow.of({
      resumeInvitation: () => Effect.die("not used"),
      resumeReview: () => Effect.die("not used"),
      start: (registrationId) => {
        startedRegistrationId = registrationId;
        return Effect.die("invalid workflow function");
      },
    });

    return Effect.gen(function* () {
      const exit = yield* submitRegistrationForReview({
        details: details(),
        storeKey: StoreKey.make("default-store"),
      }).pipe(Effect.exit);
      const registrations = yield* Registrations;

      expect(Exit.isFailure(exit)).toBe(true);
      if (startedRegistrationId === undefined) {
        return yield* Effect.die("Expected workflow start to be attempted");
      }

      const persisted = yield* registrations
        .get(startedRegistrationId)
        .pipe(Effect.exit);
      expect(Exit.isFailure(persisted)).toBe(true);
    }).pipe(Effect.provide(layerWithRecords([], { workflow })));
  });

  it.effect(
    "rejects duplicate pending Registration emails before creating",
    () =>
      Effect.gen(function* () {
        const error = yield* submitRegistrationForReview({
          details: details({ email: " ADA@example.com " }),
          storeKey: StoreKey.make("default-store"),
        }).pipe(Effect.flip);
        const registrations = yield* Registrations;

        expect(error).toBeInstanceOf(RegistrationIntakeValidationError);
        if (error instanceof RegistrationIntakeValidationError) {
          expect(error.reasons[0]).toBeInstanceOf(DuplicateRegistrationEmail);
        }

        const missing = yield* registrations
          .get("registration-existing" as AwaitingApprovalRegistration["id"])
          .pipe(Effect.exit);
        expect(Exit.isFailure(missing)).toBe(true);
      }).pipe(
        Effect.provide(
          layerWithRecords([record(makeAwaiting("ada@example.com"))])
        )
      )
  );

  it.effect(
    "returns all validation reasons from provider-independent eligibility checks",
    () =>
      Effect.gen(function* () {
        const error = yield* submitRegistrationForReview({
          details: details({ country: "US", vatId: "VAT-INVALID" }),
          storeKey: StoreKey.make("default-store"),
        }).pipe(Effect.flip);

        expect(error).toBeInstanceOf(RegistrationIntakeValidationError);
        if (error instanceof RegistrationIntakeValidationError) {
          expect(error.reasons.map((reason) => reason._tag)).toEqual([
            "DuplicateRegistrationEmail",
            "InvalidRegistrationVatId",
            "UnsupportedRegistrationCountry",
          ]);
          expect(error.reasons[0]).toBeInstanceOf(DuplicateRegistrationEmail);
          expect(error.reasons[1]).toBeInstanceOf(InvalidRegistrationVatId);
          expect(error.reasons[2]).toBeInstanceOf(
            UnsupportedRegistrationCountry
          );
        }
      }).pipe(
        Effect.provide(
          layerWithRecords([], {
            hasCustomerWithEmail: true,
            invalidVatIds: ["VAT-INVALID"],
            supportedCountries: ["CA"],
          })
        )
      )
  );

  it.effect("keeps provider lookup failures in the typed error channel", () =>
    Effect.gen(function* () {
      const error = yield* submitRegistrationForReview({
        details: details(),
        storeKey: StoreKey.make("default-store"),
      }).pipe(Effect.flip);

      expect(error).toMatchObject({
        _tag: "CommerceAccountUnavailable",
        message: "commerce unavailable",
      });
    }).pipe(
      Effect.provide(
        layerWithRecords([], {
          commerceFailure: new CommerceAccountUnavailable({
            message: "commerce unavailable",
          }),
        })
      )
    )
  );
});
