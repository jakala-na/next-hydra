import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer, Redacted } from "effect";

import {
  CommerceBusinessUnitId,
  CommerceBusinessUnitKey,
  CommerceBusinessUnitLabel,
  CommerceBusinessUnitMembership,
  CommerceCustomerId,
  CommerceCustomerProfile,
} from "../domain/commerce-account";
import type { CompanyRoles } from "../domain/commerce-account";
import {
  AuthUserId,
  CustomerCommercePrincipal,
} from "../domain/commerce-request-context";
import { CommerceAccounts } from "../services/commerce-accounts";
import { CommerceContext } from "../services/commerce-context";
import { CommerceLocale, resolveStore } from "../store";
import { getCustomerAccountOverview } from "./programs";

const customerId = CommerceCustomerId.make("customer-1");
const businessUnitId = CommerceBusinessUnitId.make("business-unit-1");

const layer = (roles: CompanyRoles) => {
  const principal = new CustomerCommercePrincipal({
    authUserId: AuthUserId.make("auth-user-1"),
    businessUnitId,
    businessUnitKey: CommerceBusinessUnitKey.make("business-unit-key-1"),
    customerId,
    roles,
  });
  const context = CommerceContext.of({
    customerPrincipal: () => Effect.succeed(principal),
    customerProfile: () =>
      Effect.succeed(
        new CommerceCustomerProfile({
          customerId,
          email: Redacted.make("administrator@example.com", {
            label: "email",
          }),
        })
      ),
    principal,
    store: resolveStore({ locale: CommerceLocale.make("en-US") }),
  });
  const accounts = CommerceAccounts.of({
    addAssociate: () => Effect.die("not used"),
    createFromRegistration: () => Effect.die("not used"),
    getCustomerIdByAuthUserId: () => Effect.die("not used"),
    getCustomerProfile: () => Effect.die("not used"),
    hasCustomerWithEmail: () => Effect.die("not used"),
    linkRegistrantIdentity: () => Effect.die("not used"),
    listBusinessUnitMembershipsForCustomerInStore: () =>
      Effect.succeed([
        new CommerceBusinessUnitMembership({
          businessUnitId,
          businessUnitKey: CommerceBusinessUnitKey.make("business-unit-key-1"),
          businessUnitLabel: CommerceBusinessUnitLabel.make("Acme Brewery"),
          roles,
        }),
      ]),
  });

  return Layer.mergeAll(
    Layer.succeed(CommerceContext, context),
    Layer.succeed(CommerceAccounts, accounts)
  );
};

describe("customer account programs", () => {
  it.effect("derives invitation access for an administrator", () =>
    Effect.gen(function* () {
      const overview = yield* getCustomerAccountOverview();

      expect(overview).toMatchObject({
        canInvite: true,
        companyLabel: "Acme Brewery",
      });
    }).pipe(Effect.provide(layer(["admin", "buyer"])))
  );

  it.effect("keeps account members without Admin read-only", () =>
    Effect.gen(function* () {
      const overview = yield* getCustomerAccountOverview();

      expect(overview).toMatchObject({
        canInvite: false,
        companyLabel: "Acme Brewery",
      });
    }).pipe(Effect.provide(layer(["buyer"])))
  );
});
