import { describe, expect, it } from "@effect/vitest";
import { StoreKey } from "@repo/commerce/store";
import { Effect, Redacted, Schema } from "effect";

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
  RegistrationDecisionRequest,
  RegistrationDecisionResponse,
  toCompanyRegistrationDetails,
  toRegistrationQueryApiError,
  toRegistrationDetailResponse,
} from "./registration-api";

const registrationPayload = {
  address: {
    additionalStreetInfo: "Suite 42",
    city: "New York",
    country: "US",
    postalCode: "10001",
    region: "NY",
    streetName: "1 Computation Way",
  },
  companyName: "Hydra Supplies",
  companyPhone: "+1 555 0100",
  contactFirstName: "Ada",
  contactLastName: "Lovelace",
  email: "ada@example.com",
  vatId: "VAT-123",
};

const details = new CompanyRegistrationDetails({
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

describe("Registration REST contract mappers", () => {
  it("maps create payloads to domain registration details", () => {
    const mapped = toCompanyRegistrationDetails(
      new CreateRegistrationRequest(registrationPayload)
    );

    expect(String(mapped.companyName)).toBe("Hydra Supplies");
    expect(Redacted.value(mapped.email)).toBe("ada@example.com");
    expect(Redacted.value(mapped.address.streetName)).toBe("1 Computation Way");
  });

  it("maps domain registrations to REST detail responses", () => {
    const registration = new AwaitingApprovalRegistration({
      _tag: "AwaitingApprovalRegistration",
      createdAt: new Date("2026-03-22T00:00:00.000Z"),
      details,
      id: RegistrationId.make("registration-1"),
      status: "awaiting_approval",
      storeKey: StoreKey.make("default-store"),
      updatedAt: new Date("2026-03-22T00:00:01.000Z"),
    });

    expect(toRegistrationDetailResponse(registration)).toMatchObject({
      companyName: "Hydra Supplies",
      createdAt: "2026-03-22T00:00:00.000Z",
      email: "ada@example.com",
      registrationId: "registration-1",
      status: "awaiting_approval",
      storeKey: "default-store",
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

  it.effect("encodes decisions without caller-supplied reviewer identity", () =>
    Effect.gen(function* () {
      const encoded = yield* Schema.encodeUnknownEffect(
        RegistrationDecisionRequest
      )(new RegistrationDecisionRequest({ reason: "Looks good" }));

      expect(encoded).toStrictEqual({ reason: "Looks good" });
    })
  );

  it.effect("encodes list query values for generated REST clients", () =>
    Effect.gen(function* () {
      const query = new ListRegistrationsQuery({
        limit: 20,
        status: "awaiting_approval",
      });

      const encoded = yield* Schema.encodeUnknownEffect(ListRegistrationsQuery)(
        query
      );

      expect(encoded).toStrictEqual({
        limit: "20",
        status: "awaiting_approval",
      });
    })
  );

  it("sanitizes internal registration error messages in API errors", () => {
    const error = toRegistrationQueryApiError(
      new RegistrationQueryFailure({
        cause: new Error('SchemaError(Missing key at ["id"])'),
        message:
          'Failed to list registrations: SchemaError(Missing key at ["id"])',
        operation: "list",
      })
    );

    expect(error).toBeInstanceOf(RegistrationApiError);
    expect(error.message).toBe(
      "The registration service is temporarily unavailable."
    );
  });
});
