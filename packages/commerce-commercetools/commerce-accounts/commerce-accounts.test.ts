import type { ByProjectKeyRequestBuilder } from "@commercetools/platform-sdk";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Redacted } from "effect";
import { beforeEach, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  CommerceAccount,
  CommerceBusinessUnitId,
  CommerceCustomerId,
} from "@repo/commerce/domain/commerce-account";
import {
  type AcceptedCommerceIdentity,
  CommerceAccountError,
  CommerceAccounts,
} from "@repo/commerce/services/commerce-accounts";
import { StoreKey } from "@repo/commerce/store";
import { commerceAccountsLayerFrom } from "./commerce-accounts";

const mocks = vi.hoisted(() => {
  const businessUnitGetExecute = vi.fn();
  const businessUnitPostExecute = vi.fn();
  const businessUnitCreateExecute = vi.fn();
  const businessUnitCreate = vi.fn(() => ({
    execute: businessUnitCreateExecute,
  }));
  const businessUnitWithKeyGetExecute = vi.fn();
  const businessUnitWithKeyGet = vi.fn(() => ({
    execute: businessUnitWithKeyGetExecute,
  }));
  const businessUnitWithKey = vi.fn(() => ({
    get: businessUnitWithKeyGet,
  }));
  const businessUnitGet = vi.fn(() => ({ execute: businessUnitGetExecute }));
  const businessUnitPost = vi.fn(() => ({
    execute: businessUnitPostExecute,
  }));
  const businessUnitWithId = vi.fn(() => ({
    get: businessUnitGet,
    post: businessUnitPost,
  }));
  const businessUnits = vi.fn(() => ({
    withId: businessUnitWithId,
    withKey: businessUnitWithKey,
    post: businessUnitCreate,
  }));
  const inStoreBusinessUnitsGetExecute = vi.fn();
  const inStoreBusinessUnitsGet = vi.fn(() => ({
    execute: inStoreBusinessUnitsGetExecute,
  }));
  const inStoreBusinessUnits = vi.fn(() => ({
    get: inStoreBusinessUnitsGet,
  }));
  const inStore = vi.fn(() => ({
    businessUnits: inStoreBusinessUnits,
  }));
  const customerGetExecute = vi.fn();
  const customerPostExecute = vi.fn();
  const customerCreateExecute = vi.fn();
  const customerCreate = vi.fn(() => ({ execute: customerCreateExecute }));
  const customerWithKeyGetExecute = vi.fn();
  const customerWithKeyGet = vi.fn(() => ({
    execute: customerWithKeyGetExecute,
  }));
  const customerWithKey = vi.fn(() => ({ get: customerWithKeyGet }));
  const customerGet = vi.fn(() => ({ execute: customerGetExecute }));
  const customerPost = vi.fn(() => ({ execute: customerPostExecute }));
  const customerWithId = vi.fn(() => ({
    get: customerGet,
    post: customerPost,
  }));
  const customers = vi.fn(() => ({
    withId: customerWithId,
    withKey: customerWithKey,
    post: customerCreate,
  }));

  return {
    businessUnitCreate,
    businessUnitCreateExecute,
    businessUnitGet,
    businessUnitGetExecute,
    businessUnitPost,
    businessUnitPostExecute,
    businessUnitWithId,
    businessUnitWithKey,
    businessUnitWithKeyGet,
    businessUnitWithKeyGetExecute,
    businessUnits,
    inStore,
    inStoreBusinessUnits,
    inStoreBusinessUnitsGet,
    inStoreBusinessUnitsGetExecute,
    customerCreate,
    customerCreateExecute,
    customerGet,
    customerGetExecute,
    customerPost,
    customerPostExecute,
    customerWithId,
    customerWithKey,
    customerWithKeyGet,
    customerWithKeyGetExecute,
    customers,
  };
});

const apiRoot = {
  businessUnits: mocks.businessUnits,
  customers: mocks.customers,
  inStoreKeyWithStoreKeyValue: mocks.inStore,
} as unknown as ByProjectKeyRequestBuilder;

const layerCommercetoolsCommerceAccounts = commerceAccountsLayerFrom(apiRoot);

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
  mocks.customerCreate.mockClear();
  mocks.customerCreateExecute.mockReset();
  mocks.customerGet.mockClear();
  mocks.customerGetExecute.mockReset();
  mocks.customerPost.mockClear();
  mocks.customerPostExecute.mockReset();
  mocks.customerWithId.mockClear();
  mocks.customerWithKey.mockClear();
  mocks.customerWithKeyGet.mockClear();
  mocks.customerWithKeyGetExecute.mockReset();
  mocks.customers.mockClear();
  mocks.businessUnitCreate.mockClear();
  mocks.businessUnitCreateExecute.mockReset();
  mocks.businessUnitGet.mockClear();
  mocks.businessUnitGetExecute.mockReset();
  mocks.businessUnitPost.mockClear();
  mocks.businessUnitPostExecute.mockReset();
  mocks.businessUnitWithId.mockClear();
  mocks.businessUnitWithKey.mockClear();
  mocks.businessUnitWithKeyGet.mockClear();
  mocks.businessUnitWithKeyGetExecute.mockReset();
  mocks.businessUnits.mockClear();
  mocks.inStore.mockClear();
  mocks.inStoreBusinessUnits.mockClear();
  mocks.inStoreBusinessUnitsGet.mockClear();
  mocks.inStoreBusinessUnitsGetExecute.mockReset();
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

  it.effect(
    "associates a provisioned Business Unit with the Registration Store",
    () =>
      Effect.gen(function* () {
        mocks.customerWithKeyGetExecute.mockRejectedValueOnce({
          statusCode: 404,
        });
        mocks.customerCreateExecute.mockResolvedValueOnce({
          body: {
            customer: {
              id: "customer-1",
            },
          },
        });
        mocks.businessUnitWithKeyGetExecute.mockRejectedValueOnce({
          statusCode: 404,
        });
        mocks.businessUnitCreateExecute.mockResolvedValueOnce({
          body: {
            id: "business-unit-1",
          },
        });

        const commerceAccounts = yield* CommerceAccounts;
        yield* commerceAccounts.createFromRegistration({
          _tag: "AwaitingApprovalRegistration",
          id: "registration-1",
          storeKey: StoreKey.make("de-fr-uk"),
          details: {
            companyName: "Hydra Supply",
            contactFirstName: Redacted.make("Ada", { label: "personName" }),
            contactLastName: Redacted.make("Lovelace", {
              label: "personName",
            }),
            email: Redacted.make("ada@example.com", { label: "email" }),
            address: {
              streetName: Redacted.make("Main Street", {
                label: "addressLine",
              }),
              postalCode: Redacted.make("10001", { label: "postalCode" }),
              city: Redacted.make("New York", { label: "city" }),
              country: "US",
            },
          },
        });

        expect(mocks.businessUnitCreate).toHaveBeenCalledWith({
          body: expect.objectContaining({
            addresses: [
              expect.objectContaining({
                key: "address-book-cmVnaXN0cmF0aW9uLXJlZ2lzdHJhdGlvbi0x",
              }),
            ],
            stores: [{ typeId: "store", key: "de-fr-uk" }],
          }),
        });
      }).pipe(Effect.provide(layerCommercetoolsCommerceAccounts))
  );

  it.effect(
    "repairs the Store association when provisioning resumes with an existing Business Unit",
    () =>
      Effect.gen(function* () {
        mocks.customerWithKeyGetExecute.mockResolvedValueOnce({
          body: {
            id: "customer-1",
          },
        });
        mocks.businessUnitWithKeyGetExecute.mockResolvedValueOnce({
          body: {
            id: "business-unit-1",
            version: 3,
            stores: [{ typeId: "store", key: "default-store" }],
          },
        });
        mocks.businessUnitPostExecute.mockResolvedValueOnce({
          body: {
            id: "business-unit-1",
            version: 4,
            stores: [{ typeId: "store", key: "de-fr-uk" }],
          },
        });

        const commerceAccounts = yield* CommerceAccounts;
        yield* commerceAccounts.createFromRegistration({
          _tag: "AwaitingApprovalRegistration",
          id: "registration-1",
          storeKey: StoreKey.make("de-fr-uk"),
          details: {
            companyName: "Hydra Supply",
            contactFirstName: Redacted.make("Ada", { label: "personName" }),
            contactLastName: Redacted.make("Lovelace", {
              label: "personName",
            }),
            email: Redacted.make("ada@example.com", { label: "email" }),
            address: {
              streetName: Redacted.make("Main Street", {
                label: "addressLine",
              }),
              postalCode: Redacted.make("10001", { label: "postalCode" }),
              city: Redacted.make("New York", { label: "city" }),
              country: "US",
            },
          },
        });

        expect(mocks.businessUnitPost).toHaveBeenCalledWith({
          body: {
            version: 3,
            actions: [
              {
                action: "setStores",
                stores: [{ typeId: "store", key: "de-fr-uk" }],
              },
            ],
          },
        });
        expect(mocks.businessUnitCreate).not.toHaveBeenCalled();
      }).pipe(Effect.provide(layerCommercetoolsCommerceAccounts))
  );

  it.effect(
    "reconciles a concurrent Business Unit Store update before retrying",
    () =>
      Effect.gen(function* () {
        mocks.customerWithKeyGetExecute.mockResolvedValueOnce({
          body: { id: "customer-1" },
        });
        mocks.businessUnitWithKeyGetExecute.mockResolvedValueOnce({
          body: {
            id: "business-unit-1",
            version: 3,
            stores: [{ typeId: "store", key: "default-store" }],
          },
        });
        mocks.businessUnitPostExecute.mockRejectedValueOnce({
          statusCode: 409,
          body: {
            errors: [
              {
                code: "ConcurrentModification",
                currentVersion: 4,
              },
            ],
          },
        });
        mocks.businessUnitGetExecute.mockResolvedValueOnce({
          body: {
            id: "business-unit-1",
            version: 4,
            stores: [{ typeId: "store", key: "de-fr-uk" }],
          },
        });

        const commerceAccounts = yield* CommerceAccounts;
        yield* commerceAccounts.createFromRegistration({
          _tag: "AwaitingApprovalRegistration",
          id: "registration-1",
          storeKey: StoreKey.make("de-fr-uk"),
          details: {
            companyName: "Hydra Supply",
            contactFirstName: Redacted.make("Ada", { label: "personName" }),
            contactLastName: Redacted.make("Lovelace", {
              label: "personName",
            }),
            email: Redacted.make("ada@example.com", { label: "email" }),
            address: {
              streetName: Redacted.make("Main Street", {
                label: "addressLine",
              }),
              postalCode: Redacted.make("10001", { label: "postalCode" }),
              city: Redacted.make("New York", { label: "city" }),
              country: "US",
            },
          },
        });

        expect(mocks.businessUnitPost).toHaveBeenCalledTimes(1);
        expect(mocks.businessUnitGet).toHaveBeenCalledTimes(1);
      }).pipe(Effect.provide(layerCommercetoolsCommerceAccounts))
  );

  it.effect("reads the current customer profile by verified customer id", () =>
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

      const commerceAccounts = yield* CommerceAccounts;
      const profile = yield* commerceAccounts.getCustomerProfile(
        CommerceCustomerId.make("customer-1")
      );

      expect(profile.customerId).toBe("customer-1");
      expect(profile.email && Redacted.value(profile.email)).toBe(
        "ada@example.com"
      );
      expect(profile.firstName && Redacted.value(profile.firstName)).toBe(
        "Ada"
      );
      expect(profile.lastName && Redacted.value(profile.lastName)).toBe(
        "Lovelace"
      );
    }).pipe(Effect.provide(layerCommercetoolsCommerceAccounts))
  );

  it.effect("lists associated Business Units inside the Store", () =>
    Effect.gen(function* () {
      mocks.inStoreBusinessUnitsGetExecute.mockResolvedValueOnce({
        body: {
          results: [
            {
              id: "business-unit-1",
              key: "business-unit-key-1",
              name: "Hydra Supply",
            },
          ],
        },
      });

      const commerceAccounts = yield* CommerceAccounts;
      const memberships =
        yield* commerceAccounts.listBusinessUnitMembershipsForCustomerInStore(
          CommerceCustomerId.make("customer-1"),
          StoreKey.make("default-store")
        );

      expect(mocks.inStore).toHaveBeenCalledWith({
        storeKey: "default-store",
      });
      expect(mocks.inStoreBusinessUnitsGet).toHaveBeenCalledWith({
        queryArgs: {
          where:
            'associates(customer(id="customer-1")) or inheritedAssociates(customer(id="customer-1"))',
          limit: 500,
          offset: 0,
          sort: "id asc",
        },
      });
      expect(memberships).toEqual([
        expect.objectContaining({
          businessUnitId: "business-unit-1",
          businessUnitKey: "business-unit-key-1",
          businessUnitLabel: "Hydra Supply",
        }),
      ]);
    }).pipe(Effect.provide(layerCommercetoolsCommerceAccounts))
  );

  it.effect(
    "returns every Business Unit membership instead of selecting one",
    () =>
      Effect.gen(function* () {
        mocks.inStoreBusinessUnitsGetExecute.mockResolvedValueOnce({
          body: {
            results: [
              {
                id: "business-unit-1",
                key: "business-unit-key-1",
                name: "Hydra Supply",
              },
              {
                id: "business-unit-2",
                key: "business-unit-key-2",
                name: "Hydra Distribution",
              },
            ],
          },
        });

        const commerceAccounts = yield* CommerceAccounts;
        const memberships =
          yield* commerceAccounts.listBusinessUnitMembershipsForCustomerInStore(
            CommerceCustomerId.make("customer-1"),
            StoreKey.make("default-store")
          );

        expect(memberships.map(({ businessUnitId }) => businessUnitId)).toEqual(
          ["business-unit-1", "business-unit-2"]
        );
      }).pipe(Effect.provide(layerCommercetoolsCommerceAccounts))
  );

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
    "rebuilds Customer identity changes after a concurrent update",
    () =>
      Effect.gen(function* () {
        mocks.customerGetExecute
          .mockResolvedValueOnce({
            body: {
              id: "customer-1",
              version: 7,
              email: "ada@example.com",
              firstName: "Ada",
              lastName: "Lovelace",
            },
          })
          .mockResolvedValueOnce({
            body: {
              id: "customer-1",
              version: 8,
              externalId: "user_01KG3ZSVVGPQ0NQ1FBZZJ2HTXV",
              email: "ada@example.com",
              firstName: "Ada",
              lastName: "Lovelace",
            },
          });
        mocks.customerPostExecute.mockRejectedValueOnce({
          statusCode: 409,
          body: {
            errors: [
              {
                code: "ConcurrentModification",
                currentVersion: 8,
              },
            ],
          },
        });
        mocks.businessUnitGetExecute.mockResolvedValueOnce({
          body: {
            id: "business-unit-1",
            version: 3,
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

        expect(mocks.customerPost).toHaveBeenCalledTimes(1);
        expect(mocks.customerGet).toHaveBeenCalledTimes(2);
        expect(mocks.businessUnitPost).not.toHaveBeenCalled();
      }).pipe(Effect.provide(layerCommercetoolsCommerceAccounts))
  );

  it.effect("reconciles a concurrently added Business Unit associate", () =>
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
      mocks.businessUnitGetExecute
        .mockResolvedValueOnce({
          body: {
            id: "business-unit-1",
            version: 3,
            associates: [],
          },
        })
        .mockResolvedValueOnce({
          body: {
            id: "business-unit-1",
            version: 4,
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
      mocks.businessUnitPostExecute.mockRejectedValueOnce({
        statusCode: 409,
        body: {
          errors: [
            {
              code: "ConcurrentModification",
              currentVersion: 4,
            },
          ],
        },
      });

      const commerceAccounts = yield* CommerceAccounts;
      yield* commerceAccounts.linkRegistrantIdentity({
        registration,
        acceptedIdentity,
      });

      expect(mocks.businessUnitPost).toHaveBeenCalledTimes(1);
      expect(mocks.businessUnitGet).toHaveBeenCalledTimes(2);
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
