import { describe, expect, it } from "@effect/vitest";
import { Effect, Redacted } from "effect";
import { beforeEach, vi } from "vitest";
import {
  CommerceAccount,
  CommerceBusinessUnitId,
  CommerceCustomerId,
} from "../../../domain/commerce-account";
import {
  type AcceptedCommerceIdentity,
  CommerceAccountError,
  CommerceAccounts,
} from "../../../services/commerce-accounts";
import { layerCommercetoolsCommerceAccounts } from "./commerce-accounts";

const mocks = vi.hoisted(() => {
  const businessUnitGetExecute = vi.fn();
  const businessUnitPostExecute = vi.fn();
  const businessUnitGet = vi.fn(() => ({ execute: businessUnitGetExecute }));
  const businessUnitPost = vi.fn(() => ({
    execute: businessUnitPostExecute,
  }));
  const businessUnitWithId = vi.fn(() => ({
    get: businessUnitGet,
    post: businessUnitPost,
  }));
  const businessUnits = vi.fn(() => ({ withId: businessUnitWithId }));
  const customerGetExecute = vi.fn();
  const customerPostExecute = vi.fn();
  const customerGet = vi.fn(() => ({ execute: customerGetExecute }));
  const customerPost = vi.fn(() => ({ execute: customerPostExecute }));
  const customerWithId = vi.fn(() => ({
    get: customerGet,
    post: customerPost,
  }));
  const customers = vi.fn(() => ({ withId: customerWithId }));

  return {
    businessUnitGet,
    businessUnitGetExecute,
    businessUnitPost,
    businessUnitPostExecute,
    businessUnitWithId,
    businessUnits,
    customerGet,
    customerGetExecute,
    customerPost,
    customerPostExecute,
    customerWithId,
    customers,
  };
});

vi.mock("../../client/api-root", () => ({
  apiRoot: {
    businessUnits: mocks.businessUnits,
    customers: mocks.customers,
  },
}));

const acceptedIdentity: AcceptedCommerceIdentity = {
  authUserId: "user_01KG3ZSVVGPQ0NQ1FBZZJ2HTXV",
  email: Redacted.make("ada@example.com", { label: "email" }),
  firstName: Redacted.make("Ada", { label: "personName" }),
  lastName: Redacted.make("Lovelace", {
    label: "personName",
  }),
};

const registration = {
  id: "registration-1",
  commerceAccount: new CommerceAccount({
    registrationId: "registration-1",
    customerId: CommerceCustomerId.make("customer-1"),
    businessUnitId: CommerceBusinessUnitId.make("business-unit-1"),
  }),
};

beforeEach(() => {
  mocks.customerGet.mockClear();
  mocks.customerGetExecute.mockReset();
  mocks.customerPost.mockClear();
  mocks.customerPostExecute.mockReset();
  mocks.customerWithId.mockClear();
  mocks.customers.mockClear();
  mocks.businessUnitGet.mockClear();
  mocks.businessUnitGetExecute.mockReset();
  mocks.businessUnitPost.mockClear();
  mocks.businessUnitPostExecute.mockReset();
  mocks.businessUnitWithId.mockClear();
  mocks.businessUnits.mockClear();
});

describe("layerCommercetoolsCommerceAccounts", () => {
  it("uses the commerce failure reason as the error message", () => {
    const error = new CommerceAccountError({
      message: "Failed to add Commercetools business unit associate",
    });

    expect(error.message).toBe(
      "Failed to add Commercetools business unit associate"
    );
    expect(error.stack).toContain(
      "Failed to add Commercetools business unit associate"
    );
  });

  it.effect("sets the WorkOS user id as the customer external id", () =>
    Effect.gen(function* () {
      mocks.customerGetExecute.mockResolvedValueOnce({
        body: {
          id: "customer-1",
          version: 7,
          email: "ada@example.com",
          firstName: "Ada",
          lastName: "Lovelace",
        },
      });
      mocks.customerPostExecute.mockResolvedValueOnce({
        body: {
          id: "customer-1",
          version: 8,
          externalId: "user_01KG3ZSVVGPQ0NQ1FBZZJ2HTXV",
          email: "ada@example.com",
          firstName: "Ada",
          lastName: "Lovelace",
        },
      });
      mocks.businessUnitGetExecute.mockResolvedValueOnce({
        body: {
          id: "business-unit-1",
          version: 3,
          status: "Active",
          associates: [],
        },
      });
      mocks.businessUnitPostExecute.mockResolvedValueOnce({
        body: {
          id: "business-unit-1",
          version: 4,
          status: "Active",
        },
      });

      const commerceAccounts = yield* CommerceAccounts;
      yield* commerceAccounts.linkRegistrantIdentity({
        registration,
        acceptedIdentity,
      });

      expect(mocks.customerPost).toHaveBeenCalledWith({
        body: {
          version: 7,
          actions: [
            {
              action: "setExternalId",
              externalId: "user_01KG3ZSVVGPQ0NQ1FBZZJ2HTXV",
            },
          ],
        },
      });
      expect(mocks.businessUnitPost).toHaveBeenCalledWith({
        body: {
          version: 3,
          actions: [
            {
              action: "addAssociate",
              associate: {
                customer: { typeId: "customer", id: "customer-1" },
                associateRoleAssignments: [
                  {
                    associateRole: {
                      typeId: "associate-role",
                      key: "owner",
                    },
                    inheritance: "Enabled",
                  },
                ],
              },
            },
          ],
        },
      });
    }).pipe(Effect.provide(layerCommercetoolsCommerceAccounts))
  );

  it.effect(
    "does not update the business unit when the owner associate already exists",
    () =>
      Effect.gen(function* () {
        mocks.customerGetExecute.mockResolvedValueOnce({
          body: {
            id: "customer-1",
            version: 8,
            externalId: "user_01KG3ZSVVGPQ0NQ1FBZZJ2HTXV",
            email: "ada@example.com",
            firstName: "Ada",
            lastName: "Lovelace",
          },
        });
        mocks.businessUnitGetExecute.mockResolvedValueOnce({
          body: {
            id: "business-unit-1",
            version: 3,
            status: "Active",
            associates: [
              {
                customer: { typeId: "customer", id: "customer-1" },
                associateRoleAssignments: [
                  {
                    associateRole: {
                      typeId: "associate-role",
                      key: "owner",
                    },
                    inheritance: "Enabled",
                  },
                ],
              },
            ],
          },
        });

        const commerceAccounts = yield* CommerceAccounts;
        yield* commerceAccounts.linkRegistrantIdentity({
          registration,
          acceptedIdentity,
        });

        expect(mocks.customerPost).not.toHaveBeenCalled();
        expect(mocks.businessUnitPost).not.toHaveBeenCalled();
      }).pipe(Effect.provide(layerCommercetoolsCommerceAccounts))
  );

  it.effect(
    "includes Commercetools response details when owner association fails",
    () =>
      Effect.gen(function* () {
        mocks.customerGetExecute.mockResolvedValueOnce({
          body: {
            id: "customer-1",
            version: 8,
            externalId: "user_01KG3ZSVVGPQ0NQ1FBZZJ2HTXV",
            email: "ada@example.com",
            firstName: "Ada",
            lastName: "Lovelace",
          },
        });
        mocks.businessUnitGetExecute.mockResolvedValueOnce({
          body: {
            id: "business-unit-1",
            version: 3,
            status: "Active",
            associates: [],
          },
        });
        mocks.businessUnitPostExecute.mockRejectedValueOnce({
          statusCode: 400,
          body: {
            message: "The referenced associate role does not exist.",
            errors: [
              {
                code: "ReferencedResourceNotFound",
                message: "Referenced resource with key owner was not found.",
              },
            ],
          },
        });

        const commerceAccounts = yield* CommerceAccounts;
        const error = yield* commerceAccounts
          .linkRegistrantIdentity({
            registration,
            acceptedIdentity,
          })
          .pipe(Effect.flip);

        expect(error).toBeInstanceOf(CommerceAccountError);
        expect(error.message).toContain(
          "Failed to add Commercetools business unit associate"
        );
        expect(error.message).toContain(
          "The referenced associate role does not exist."
        );
        expect(error.message).toContain("ReferencedResourceNotFound");
      }).pipe(Effect.provide(layerCommercetoolsCommerceAccounts))
  );
});
