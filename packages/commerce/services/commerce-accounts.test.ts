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

      expect({
        customerId,
        email: profile.email && Redacted.value(profile.email),
        firstName: profile.firstName && Redacted.value(profile.firstName),
        lastName: profile.lastName && Redacted.value(profile.lastName),
      }).toStrictEqual({
        customerId: commerceAccount.customerId,
        email: "ada@example.com",
        firstName: "Ada",
        lastName: "Lovelace",
      });
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

  it.effect("keeps one Customer across multiple Business Units", () =>
    Effect.gen(function* () {
      const accounts = yield* CommerceAccounts;
      const firstAccount = yield* accounts.createFromRegistration(registration);
      const secondAccount = yield* accounts.createFromRegistration({
        ...registration,
        details: {
          ...registration.details,
          companyName: "Difference Engine",
          email: Redacted.make("charles@example.com", { label: "email" }),
        },
        id: "registration-2",
      });

      const firstMembership = yield* accounts.addAssociate({
        acceptedIdentity,
        businessUnitId: firstAccount.businessUnitId,
        roles: ["buyer"],
      });
      const secondMembership = yield* accounts.addAssociate({
        acceptedIdentity,
        businessUnitId: secondAccount.businessUnitId,
        roles: ["approver"],
      });
      const memberships =
        yield* accounts.listBusinessUnitMembershipsForCustomerInStore(
          firstMembership.customerId,
          StoreKey.make("default-store")
        );

      expect(secondMembership.customerId).toBe(firstMembership.customerId);
      expect(memberships).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            businessUnitId: firstAccount.businessUnitId,
            roles: ["buyer"],
          }),
          expect.objectContaining({
            businessUnitId: secondAccount.businessUnitId,
            roles: ["approver"],
          }),
        ])
      );
    }).pipe(Effect.provide(CommerceAccounts.layerMemory))
  );

  it.effect(
    "lets an initial Company administrator join another Business Unit",
    () =>
      Effect.gen(function* () {
        const accounts = yield* CommerceAccounts;
        const firstAccount =
          yield* accounts.createFromRegistration(registration);
        yield* accounts.linkRegistrantIdentity({
          acceptedIdentity,
          commerceAccount: firstAccount,
        });
        const secondAccount = yield* accounts.createFromRegistration({
          ...registration,
          details: {
            ...registration.details,
            companyName: "Difference Engine",
            email: Redacted.make("charles@example.com", { label: "email" }),
          },
          id: "registration-2",
        });

        const secondMembership = yield* accounts.addAssociate({
          acceptedIdentity,
          businessUnitId: secondAccount.businessUnitId,
          roles: ["approver"],
        });
        const memberships =
          yield* accounts.listBusinessUnitMembershipsForCustomerInStore(
            firstAccount.customerId,
            StoreKey.make("default-store")
          );

        expect(secondMembership.customerId).toBe(firstAccount.customerId);
        expect(memberships).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              businessUnitId: firstAccount.businessUnitId,
              roles: ["admin", "buyer"],
            }),
            expect.objectContaining({
              businessUnitId: secondAccount.businessUnitId,
              roles: ["approver"],
            }),
          ])
        );
      }).pipe(Effect.provide(CommerceAccounts.layerMemory))
  );
});
