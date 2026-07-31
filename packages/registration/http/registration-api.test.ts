import { describe, expect, it } from "@effect/vitest";
import { StoreKey } from "@repo/commerce/domain/cart";
import { Effect, Redacted, Schema } from "effect";
import { RegistrationReviewerActor } from "../domain/actors";
import {
  AddressLine,
  City,
  CompanyName,
  CountryCode,
  Email,
  PersonName,
  PhoneNumber,
  PostalCode,
  RegistrationId,
  VatId,
} from "../domain/identity";
import {
  AwaitingApprovalRegistration,
  CompanyAddress,
  CompanyRegistrationDetails,
} from "../domain/registration";
import { RegistrationQueryFailure } from "../services/registration-queries";
import {
  CreateRegistrationRequest,
  ListRegistrationsQuery,
  RegistrationApiError,
  RegistrationDecisionAcceptedResponse,
  RegistrationDecisionResponse,
  RegistrationReviewerInput,
  toApiError,
  toCompanyRegistrationDetails,
  toRegistrationDetailResponse,
  toReviewerActor,
} from "./registration-api";

const registrationPayload = {
  companyName: "Hydra Supplies",
  companyPhone: "+1 555 0100",
  vatId: "VAT-123",
  contactFirstName: "Ada",
  contactLastName: "Lovelace",
  email: "ada@example.com",
  address: {
    streetName: "1 Computation Way",
    additionalStreetInfo: "Suite 42",
    postalCode: "10001",
    city: "New York",
    region: "NY",
    country: "US",
  },
};

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
    postalCode: Redacted.make(PostalCode.make("10001"), {
      label: "postalCode",
    }),
    city: Redacted.make(City.make("New York"), { label: "city" }),
    country: CountryCode.make("US"),
  }),
});

describe("Registration REST contract mappers", () => {
  it("maps create payloads to domain registration details", () => {
    const mapped = toCompanyRegistrationDetails(
      new CreateRegistrationRequest(registrationPayload)
    );

    expect(String(mapped.companyName)).toBe("Hydra Supplies");
    expect(Redacted.value(mapped.email)).toBe("ada@example.com");
    expect(Redacted.value(mapped.address.streetName)).toBe("1 Computation Way");
  });

  it("maps reviewer payloads to registration reviewer actors", () => {
    const actor = toReviewerActor(
      new RegistrationReviewerInput({
        authUserId: "auth-reviewer-1",
        email: "reviewer@example.com",
        name: "Registration Reviewer",
      })
    );

    expect(actor).toBeInstanceOf(RegistrationReviewerActor);
    expect(actor.actorType).toBe("registration_reviewer");
    expect(Redacted.value(actor.email)).toBe("reviewer@example.com");
  });

  it("maps domain registrations to REST detail responses", () => {
    const registration = new AwaitingApprovalRegistration({
      _tag: "AwaitingApprovalRegistration",
      status: "awaiting_approval",
      id: RegistrationId.make("registration-1"),
      storeKey: StoreKey.make("default-store"),
      details,
      createdAt: new Date("2026-03-22T00:00:00.000Z"),
      updatedAt: new Date("2026-03-22T00:00:01.000Z"),
    });

    expect(toRegistrationDetailResponse(registration)).toMatchObject({
      registrationId: "registration-1",
      status: "awaiting_approval",
      storeKey: "default-store",
      companyName: "Hydra Supplies",
      email: "ada@example.com",
      createdAt: "2026-03-22T00:00:00.000Z",
      updatedAt: "2026-03-22T00:00:01.000Z",
    });
  });

  it.effect("accepts only workflow-queued decision responses", () =>
    Effect.gen(function* () {
      const response = yield* Schema.decodeUnknownEffect(
        RegistrationDecisionResponse
      )({
        registrationId: "registration-1",
        status: "approval_processing",
      });

      expect(response).toBeInstanceOf(RegistrationDecisionAcceptedResponse);
    })
  );

  it.effect("encodes list query values for generated REST clients", () =>
    Effect.gen(function* () {
      const query = new ListRegistrationsQuery({
        status: "awaiting_approval",
        limit: 20,
      });

      const encoded = yield* Schema.encodeUnknownEffect(ListRegistrationsQuery)(
        query
      );

      expect(encoded).toEqual({
        status: "awaiting_approval",
        limit: "20",
      });
    })
  );

  it("preserves internal registration error messages in API errors", () => {
    const error = toApiError(
      new RegistrationQueryFailure({
        message:
          'Failed to list registrations: SchemaError(Missing key at ["id"])',
        operation: "list",
        cause: new Error('SchemaError(Missing key at ["id"])'),
      })
    );

    expect(error).toBeInstanceOf(RegistrationApiError);
    expect(error.message).toBe(
      'Failed to list registrations: SchemaError(Missing key at ["id"])'
    );
  });
});
