import { describe, expect, it } from "@effect/vitest";
import { Effect, Redacted } from "effect";

import { AuthUserId } from "../domain/commerce-request-context";
import { StoreKey } from "../store";
import { CommerceAccounts } from "./commerce-accounts";

const registration = {
  _tag: "ApprovedRegistration",
  details: {
    address: {
      city: Redacted.make("New York", { label: "city" }),
      country: "US",
      postalCode: Redacted.make("10001", { label: "postalCode" }),
      streetName: Redacted.make("Main Street", { label: "streetName" }),
    },
    companyName: "Hydra Supply",
    contactFirstName: Redacted.make("Ada", { label: "personName" }),
    contactLastName: Redacted.make("Lovelace", { label: "personName" }),
    email: Redacted.make("ada@example.com", { label: "email" }),
  },
  id: "registration-1",
  storeKey: StoreKey.make("default-store"),
} as const;

const acceptedIdentity = {
  authUserId: "auth-user-1",
  email: Redacted.make("ada@example.com", { label: "email" }),
  firstName: Redacted.make("Ada", { label: "personName" }),
  lastName: Redacted.make("Lovelace", { label: "personName" }),
};

describe(CommerceAccounts, () => {
  it.effect("resolves customer id by auth user id", () =>
    Effect.gen(function* () {
      const accounts = yield* CommerceAccounts;
      const commerceAccount =
        yield* accounts.createFromRegistration(registration);
      yield* accounts.linkRegistrantIdentity({
        acceptedIdentity,
        commerceAccount,
      });

      const customerId = yield* accounts.getCustomerIdByAuthUserId(
        AuthUserId.make(acceptedIdentity.authUserId)
      );
      const profile = yield* accounts.getCustomerProfile(customerId);
      const businessUnitMemberships =
        yield* accounts.listBusinessUnitMembershipsForCustomerInStore(
          customerId,
          StoreKey.make("default-store")
        );
      const otherStoreMemberships =
        yield* accounts.listBusinessUnitMembershipsForCustomerInStore(
          customerId,
          StoreKey.make("de-fr-uk")
        );

      expect(customerId).toBe(commerceAccount.customerId);
      expect(profile.email && Redacted.value(profile.email)).toBe(
        "ada@example.com"
      );
      expect(profile.firstName && Redacted.value(profile.firstName)).toBe(
        "Ada"
      );
      expect(profile.lastName && Redacted.value(profile.lastName)).toBe(
        "Lovelace"
      );
      expect(businessUnitMemberships).toStrictEqual([
        expect.objectContaining({
          businessUnitId: commerceAccount.businessUnitId,
          businessUnitKey: "registration-business-unit-registration-1",
          businessUnitLabel: "Hydra Supply",
        }),
      ]);
      expect(otherStoreMemberships).toStrictEqual([]);
    }).pipe(Effect.provide(CommerceAccounts.layerMemory))
  );
});
