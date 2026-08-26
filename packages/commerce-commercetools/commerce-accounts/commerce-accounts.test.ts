import type {
  BusinessUnit,
  BusinessUnitDraft,
  ByProjectKeyRequestBuilder,
  Customer,
} from "@commercetools/platform-sdk";
import { describe, expect, it } from "@effect/vitest";
import {
  CommerceAccount,
  CommerceBusinessUnitId,
  CommerceCustomerId,
} from "@repo/commerce/domain/commerce-account";
import type { AcceptedCommerceIdentity } from "@repo/commerce/services/commerce-accounts";
import {
  CommerceAccountUnavailable,
  CommerceAccounts,
  CommerceCustomerEmailConflict,
} from "@repo/commerce/services/commerce-accounts";
import { StoreKey } from "@repo/commerce/store";
import { Cause, Effect, Redacted } from "effect";
import { beforeEach, vi } from "vitest";

import { commerceAccountsLayerFrom } from "./commerce-accounts";

type BusinessUnitResponse = { body: Partial<BusinessUnit> };
type BusinessUnitPageResponse = { body: { results: Partial<BusinessUnit>[] } };
type CustomerResponse = { body: Partial<Customer> };
type CustomerPageResponse = { body: { results: Partial<Customer>[] } };
type CustomerSignInResponse = { body: { customer: Partial<Customer> } };

const mocks = vi.hoisted(() => {
  const businessUnitGetExecute = vi.fn<() => Promise<BusinessUnitResponse>>();
  const businessUnitPostExecute = vi.fn<() => Promise<BusinessUnitResponse>>();
  const businessUnitCreateExecute =
    vi.fn<() => Promise<BusinessUnitResponse>>();
  const businessUnitCreate = vi.fn<
    (_request: { readonly body: BusinessUnitDraft }) => {
      execute: typeof businessUnitCreateExecute;
    }
  >(() => ({
    execute: businessUnitCreateExecute,
  }));
  const businessUnitWithKeyGetExecute =
    vi.fn<() => Promise<BusinessUnitResponse>>();
  const businessUnitWithKeyGet = vi.fn<
    () => { execute: typeof businessUnitWithKeyGetExecute }
  >(() => ({
    execute: businessUnitWithKeyGetExecute,
  }));
  const businessUnitWithKey = vi.fn<
    () => { get: typeof businessUnitWithKeyGet }
  >(() => ({
    get: businessUnitWithKeyGet,
  }));
  const businessUnitGet = vi.fn<
    () => { execute: typeof businessUnitGetExecute }
  >(() => ({ execute: businessUnitGetExecute }));
  const businessUnitPost = vi.fn<
    () => { execute: typeof businessUnitPostExecute }
  >(() => ({
    execute: businessUnitPostExecute,
  }));
  const businessUnitWithId = vi.fn<
    () => { get: typeof businessUnitGet; post: typeof businessUnitPost }
  >(() => ({
    get: businessUnitGet,
    post: businessUnitPost,
  }));
  const businessUnits = vi.fn<
    () => {
      withId: typeof businessUnitWithId;
      withKey: typeof businessUnitWithKey;
      post: typeof businessUnitCreate;
    }
  >(() => ({
    post: businessUnitCreate,
    withId: businessUnitWithId,
    withKey: businessUnitWithKey,
  }));
  const inStoreBusinessUnitsGetExecute =
    vi.fn<() => Promise<BusinessUnitPageResponse>>();
  const inStoreBusinessUnitsGet = vi.fn<
    () => { execute: typeof inStoreBusinessUnitsGetExecute }
  >(() => ({
    execute: inStoreBusinessUnitsGetExecute,
  }));
  const inStoreBusinessUnits = vi.fn<
    () => { get: typeof inStoreBusinessUnitsGet }
  >(() => ({
    get: inStoreBusinessUnitsGet,
  }));
  const inStore = vi.fn<() => { businessUnits: typeof inStoreBusinessUnits }>(
    () => ({
      businessUnits: inStoreBusinessUnits,
    })
  );
  const customerGetExecute = vi.fn<() => Promise<CustomerResponse>>();
  const customerQueryGetExecute = vi.fn<() => Promise<CustomerPageResponse>>();
  const customerQueryGet = vi.fn<
    (request: {
      readonly queryArgs: { readonly limit: number; readonly where: string };
    }) => { execute: typeof customerQueryGetExecute }
  >(() => ({ execute: customerQueryGetExecute }));
  const customerPostExecute = vi.fn<() => Promise<CustomerResponse>>();
  const customerCreateExecute = vi.fn<() => Promise<CustomerSignInResponse>>();
  const customerCreate = vi.fn<() => { execute: typeof customerCreateExecute }>(
    () => ({ execute: customerCreateExecute })
  );
  const customerWithKeyGetExecute = vi.fn<() => Promise<CustomerResponse>>();
  const customerWithKeyGet = vi.fn<
    () => { execute: typeof customerWithKeyGetExecute }
  >(() => ({
    execute: customerWithKeyGetExecute,
  }));
  const customerWithKey = vi.fn<() => { get: typeof customerWithKeyGet }>(
    () => ({ get: customerWithKeyGet })
  );
  const customerGet = vi.fn<() => { execute: typeof customerGetExecute }>(
    () => ({ execute: customerGetExecute })
  );
  const customerPost = vi.fn<() => { execute: typeof customerPostExecute }>(
    () => ({ execute: customerPostExecute })
  );
  const customerWithId = vi.fn<
    () => { get: typeof customerGet; post: typeof customerPost }
  >(() => ({
    get: customerGet,
    post: customerPost,
  }));
  const customers = vi.fn<
    () => {
      get: typeof customerQueryGet;
      withId: typeof customerWithId;
      withKey: typeof customerWithKey;
      post: typeof customerCreate;
    }
  >(() => ({
    get: customerQueryGet,
    post: customerCreate,
    withId: customerWithId,
    withKey: customerWithKey,
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
    customerCreate,
    customerCreateExecute,
    customerGet,
    customerGetExecute,
    customerPost,
    customerPostExecute,
    customerQueryGet,
    customerQueryGetExecute,
    customerWithId,
    customerWithKey,
    customerWithKeyGet,
    customerWithKeyGetExecute,
    customers,
    inStore,
    inStoreBusinessUnits,
    inStoreBusinessUnitsGet,
    inStoreBusinessUnitsGetExecute,
  };
});

// SAFETY: Test double implements only the ByProjectKeyRequestBuilder members this suite calls.
// oxlint-disable-next-line typescript/no-unsafe-type-assertion, anti-slop/no-chained-type-assertions -- Platform ByProjectKeyRequestBuilder is not constructible in unit tests.
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
  commerceAccount: new CommerceAccount({
    businessUnitId: CommerceBusinessUnitId.make("business-unit-1"),
    customerId: CommerceCustomerId.make("customer-1"),
    registrationId: "registration-1",
  }),
  id: "registration-1",
};

describe("layerCommercetoolsCommerceAccounts", () => {
  beforeEach(() => {
    mocks.customerCreate.mockClear();
    mocks.customerCreateExecute.mockReset();
    mocks.customerGet.mockClear();
    mocks.customerGetExecute.mockReset();
    mocks.customerQueryGet.mockClear();
    mocks.customerQueryGetExecute.mockReset();
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

  it("uses the commerce failure message as the error message", () => {
    const error = new CommerceAccountUnavailable({
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
          details: {
            address: {
              city: Redacted.make("New York", { label: "city" }),
              country: "US",
              postalCode: Redacted.make("10001", { label: "postalCode" }),
              streetName: Redacted.make("Main Street", {
                label: "addressLine",
              }),
            },
            companyName: "Hydra Supply",
            contactFirstName: Redacted.make("Ada", { label: "personName" }),
            contactLastName: Redacted.make("Lovelace", {
              label: "personName",
            }),
            email: Redacted.make("ada@example.com", { label: "email" }),
          },
          id: "registration-1",
          storeKey: StoreKey.make("de-fr-uk"),
        });

        const createRequest = mocks.businessUnitCreate.mock.calls[0]?.[0];

        expect(createRequest?.body.storeMode).toBe("Explicit");
        expect(createRequest?.body.stores).toStrictEqual([
          { key: "de-fr-uk", typeId: "store" },
        ]);
        expect(createRequest?.body.addresses?.[0]?.key).toBe(
          "address-book-cmVnaXN0cmF0aW9uLXJlZ2lzdHJhdGlvbi0x"
        );
      }).pipe(Effect.provide(layerCommercetoolsCommerceAccounts))
  );

  it.effect("defects on an invalid Commercetools create response", () =>
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
      mocks.businessUnitCreateExecute.mockRejectedValueOnce(
        Object.assign(new Error("Request body does not contain valid JSON."), {
          body: {
            errors: [
              {
                code: "InvalidJsonInput",
                detailedErrorMessage:
                  "The 'stores' field does not conform to the expected shape.",
                message: "Request body does not contain valid JSON.",
              },
            ],
            message: "Request body does not contain valid JSON.",
          },
          code: "BadRequest",
          statusCode: 400,
        })
      );

      const commerceAccounts = yield* CommerceAccounts;
      const exit = yield* commerceAccounts
        .createFromRegistration({
          _tag: "AwaitingApprovalRegistration",
          details: {
            address: {
              city: Redacted.make("New York", { label: "city" }),
              country: "US",
              postalCode: Redacted.make("10001", { label: "postalCode" }),
              streetName: Redacted.make("Main Street", {
                label: "addressLine",
              }),
            },
            companyName: "Hydra Supply",
            contactFirstName: Redacted.make("Ada", { label: "personName" }),
            contactLastName: Redacted.make("Lovelace", {
              label: "personName",
            }),
            email: Redacted.make("ada@example.com", { label: "email" }),
          },
          id: "registration-1",
          storeKey: StoreKey.make("de-fr-uk"),
        })
        .pipe(Effect.exit);

      expect(exit._tag).toBe("Failure");
      if (exit._tag !== "Failure") {
        throw new Error("Expected the invalid provider response to defect");
      }
      const defect = exit.cause.reasons.find(Cause.isDieReason)?.defect;
      expect(defect).toMatchObject({
        cause: {
          body: {
            errors: [
              expect.objectContaining({
                code: "InvalidJsonInput",
                detailedErrorMessage:
                  "The 'stores' field does not conform to the expected shape.",
              }),
            ],
          },
          code: "BadRequest",
          statusCode: 400,
        },
        message: "Failed to create Commercetools business unit",
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
            stores: [{ key: "default-store", typeId: "store" }],
            version: 3,
          },
        });
        mocks.businessUnitPostExecute.mockResolvedValueOnce({
          body: {
            id: "business-unit-1",
            stores: [{ key: "de-fr-uk", typeId: "store" }],
            version: 4,
          },
        });

        const commerceAccounts = yield* CommerceAccounts;
        yield* commerceAccounts.createFromRegistration({
          _tag: "AwaitingApprovalRegistration",
          details: {
            address: {
              city: Redacted.make("New York", { label: "city" }),
              country: "US",
              postalCode: Redacted.make("10001", { label: "postalCode" }),
              streetName: Redacted.make("Main Street", {
                label: "addressLine",
              }),
            },
            companyName: "Hydra Supply",
            contactFirstName: Redacted.make("Ada", { label: "personName" }),
            contactLastName: Redacted.make("Lovelace", {
              label: "personName",
            }),
            email: Redacted.make("ada@example.com", { label: "email" }),
          },
          id: "registration-1",
          storeKey: StoreKey.make("de-fr-uk"),
        });

        expect(mocks.businessUnitPost).toHaveBeenCalledWith({
          body: {
            actions: [
              {
                action: "setStores",
                stores: [{ key: "de-fr-uk", typeId: "store" }],
              },
            ],
            version: 3,
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
            stores: [{ key: "default-store", typeId: "store" }],
            version: 3,
          },
        });
        mocks.businessUnitPostExecute.mockRejectedValueOnce({
          body: {
            errors: [
              {
                code: "ConcurrentModification",
                currentVersion: 4,
              },
            ],
          },
          statusCode: 409,
        });
        mocks.businessUnitGetExecute.mockResolvedValueOnce({
          body: {
            id: "business-unit-1",
            stores: [{ key: "de-fr-uk", typeId: "store" }],
            version: 4,
          },
        });

        const commerceAccounts = yield* CommerceAccounts;
        yield* commerceAccounts.createFromRegistration({
          _tag: "AwaitingApprovalRegistration",
          details: {
            address: {
              city: Redacted.make("New York", { label: "city" }),
              country: "US",
              postalCode: Redacted.make("10001", { label: "postalCode" }),
              streetName: Redacted.make("Main Street", {
                label: "addressLine",
              }),
            },
            companyName: "Hydra Supply",
            contactFirstName: Redacted.make("Ada", { label: "personName" }),
            contactLastName: Redacted.make("Lovelace", {
              label: "personName",
            }),
            email: Redacted.make("ada@example.com", { label: "email" }),
          },
          id: "registration-1",
          storeKey: StoreKey.make("de-fr-uk"),
        });

        expect(mocks.businessUnitPost).toHaveBeenCalledOnce();
        expect(mocks.businessUnitGet).toHaveBeenCalledOnce();
      }).pipe(Effect.provide(layerCommercetoolsCommerceAccounts))
  );

  it.effect("reads the current customer profile by verified customer id", () =>
    Effect.gen(function* () {
      mocks.customerGetExecute.mockResolvedValueOnce({
        body: {
          email: "ada@example.com",
          firstName: "Ada",
          id: "customer-1",
          lastName: "Lovelace",
          version: 7,
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

  it.effect("classifies provider rate limits as recoverable", () =>
    Effect.gen(function* () {
      mocks.customerGetExecute.mockRejectedValueOnce({ statusCode: 429 });

      const commerceAccounts = yield* CommerceAccounts;
      const error = yield* commerceAccounts
        .getCustomerProfile(CommerceCustomerId.make("customer-1"))
        .pipe(Effect.flip);

      expect(error).toBeInstanceOf(CommerceAccountUnavailable);
      expect(error).toMatchObject({
        _tag: "CommerceAccountUnavailable",
        message: "Failed to read Commercetools customer profile",
      });
    }).pipe(Effect.provide(layerCommercetoolsCommerceAccounts))
  );

  it.effect("lists associated Business Units inside the Store", () =>
    Effect.gen(function* () {
      mocks.inStoreBusinessUnitsGetExecute.mockResolvedValueOnce({
        body: {
          results: [
            {
              associates: [
                {
                  associateRoleAssignments: [
                    {
                      associateRole: {
                        key: "admin",
                        typeId: "associate-role",
                      },
                      inheritance: "Enabled",
                    },
                  ],
                  customer: { id: "customer-1", typeId: "customer" },
                },
              ],
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
          limit: 500,
          offset: 0,
          sort: "id asc",
          where:
            'associates(customer(id="customer-1")) or inheritedAssociates(customer(id="customer-1"))',
        },
      });
      expect(memberships).toStrictEqual([
        expect.objectContaining({
          businessUnitId: "business-unit-1",
          businessUnitKey: "business-unit-key-1",
          businessUnitLabel: "Hydra Supply",
          roles: ["admin"],
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
                associates: [
                  {
                    associateRoleAssignments: [
                      {
                        associateRole: {
                          key: "buyer",
                          typeId: "associate-role",
                        },
                        inheritance: "Enabled",
                      },
                    ],
                    customer: { id: "customer-1", typeId: "customer" },
                  },
                ],
                id: "business-unit-1",
                key: "business-unit-key-1",
                name: "Hydra Supply",
              },
              {
                associates: [
                  {
                    associateRoleAssignments: [
                      {
                        associateRole: {
                          key: "approver",
                          typeId: "associate-role",
                        },
                        inheritance: "Enabled",
                      },
                    ],
                    customer: { id: "customer-1", typeId: "customer" },
                  },
                ],
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

        expect(
          memberships.map(({ businessUnitId, roles }) => ({
            businessUnitId,
            roles,
          }))
        ).toStrictEqual([
          { businessUnitId: "business-unit-1", roles: ["buyer"] },
          { businessUnitId: "business-unit-2", roles: ["approver"] },
        ]);
      }).pipe(Effect.provide(layerCommercetoolsCommerceAccounts))
  );

  it.effect("adds every requested domain role to a company member", () =>
    Effect.gen(function* () {
      mocks.customerWithKeyGetExecute.mockRejectedValueOnce({
        statusCode: 404,
      });
      mocks.customerQueryGetExecute.mockResolvedValue({
        body: { results: [] },
      });
      mocks.customerCreateExecute.mockResolvedValueOnce({
        body: {
          customer: {
            email: "ada@example.com",
            externalId: "user_01KG3ZSVVGPQ0NQ1FBZZJ2HTXV",
            firstName: "Ada",
            id: "customer-1",
            key: "auth-customer-user_01KG3ZSVVGPQ0NQ1FBZZJ2HTXV",
            lastName: "Lovelace",
            version: 1,
          },
        },
      });
      mocks.businessUnitGetExecute.mockResolvedValueOnce({
        body: {
          associates: [],
          id: "business-unit-1",
          status: "Active",
          version: 3,
        },
      });
      mocks.businessUnitPostExecute.mockResolvedValueOnce({
        body: {
          id: "business-unit-1",
          status: "Active",
          version: 4,
        },
      });

      const commerceAccounts = yield* CommerceAccounts;
      const membership = yield* commerceAccounts.addAssociate({
        acceptedIdentity,
        businessUnitId: CommerceBusinessUnitId.make("business-unit-1"),
        roles: ["buyer", "approver"],
      });

      expect(mocks.customerQueryGet).toHaveBeenCalledWith({
        queryArgs: {
          limit: 1,
          where: 'lowercaseEmail = "ada@example.com"',
        },
      });
      expect(mocks.businessUnitPost).toHaveBeenCalledWith({
        body: {
          actions: [
            {
              action: "addAssociate",
              associate: {
                associateRoleAssignments: [
                  {
                    associateRole: {
                      key: "buyer",
                      typeId: "associate-role",
                    },
                    inheritance: "Enabled",
                  },
                  {
                    associateRole: {
                      key: "approver",
                      typeId: "associate-role",
                    },
                    inheritance: "Enabled",
                  },
                ],
                customer: { id: "customer-1", typeId: "customer" },
              },
            },
          ],
          version: 3,
        },
      });
      expect(membership.roles).toStrictEqual(["buyer", "approver"]);
    }).pipe(Effect.provide(layerCommercetoolsCommerceAccounts))
  );

  it.effect("queries lowercaseEmail when checking an existing customer", () =>
    Effect.gen(function* () {
      mocks.customerQueryGetExecute.mockResolvedValueOnce({
        body: { results: [{ id: "customer-1" }] },
      });

      const commerceAccounts = yield* CommerceAccounts;
      const exists = yield* commerceAccounts.hasCustomerWithEmail(
        Redacted.make("Member@Example.com", { label: "email" })
      );

      expect(exists).toBe(true);
      expect(mocks.customerQueryGet).toHaveBeenCalledWith({
        queryArgs: {
          limit: 1,
          "var.email": "member@example.com",
          where: "lowercaseEmail = :email",
        },
      });
    }).pipe(Effect.provide(layerCommercetoolsCommerceAccounts))
  );

  it.effect(
    "reports a typed conflict when another customer wins the email claim",
    () =>
      Effect.gen(function* () {
        mocks.customerWithKeyGetExecute.mockRejectedValue({ statusCode: 404 });
        mocks.customerQueryGetExecute
          .mockResolvedValueOnce({ body: { results: [] } })
          .mockResolvedValueOnce({ body: { results: [] } })
          .mockResolvedValueOnce({ body: { results: [] } })
          .mockResolvedValueOnce({
            body: {
              results: [
                {
                  email: "ADA@EXAMPLE.COM",
                  externalId: "another-auth-user",
                  id: "customer-other",
                  key: "another-customer",
                },
              ],
            },
          });
        mocks.customerCreateExecute.mockRejectedValueOnce({
          body: {
            errors: [
              {
                code: "DuplicateField",
                duplicateValue: "ada@example.com",
                field: "email",
              },
            ],
          },
          statusCode: 400,
        });

        const commerceAccounts = yield* CommerceAccounts;
        const failure = yield* commerceAccounts
          .addAssociate({
            acceptedIdentity,
            businessUnitId: CommerceBusinessUnitId.make("business-unit-1"),
            roles: ["buyer"],
          })
          .pipe(Effect.flip);

        expect(failure).toBeInstanceOf(CommerceCustomerEmailConflict);
      }).pipe(Effect.provide(layerCommercetoolsCommerceAccounts))
  );

  it.effect("maps initial company roles to Commercetools admin and buyer", () =>
    Effect.gen(function* () {
      mocks.customerGetExecute.mockResolvedValueOnce({
        body: {
          email: "ada@example.com",
          firstName: "Ada",
          id: "customer-1",
          lastName: "Lovelace",
          version: 7,
        },
      });
      mocks.customerPostExecute.mockResolvedValueOnce({
        body: {
          email: "ada@example.com",
          externalId: "user_01KG3ZSVVGPQ0NQ1FBZZJ2HTXV",
          firstName: "Ada",
          id: "customer-1",
          lastName: "Lovelace",
          version: 8,
        },
      });
      mocks.businessUnitGetExecute.mockResolvedValueOnce({
        body: {
          associates: [],
          id: "business-unit-1",
          status: "Active",
          version: 3,
        },
      });
      mocks.businessUnitPostExecute.mockResolvedValueOnce({
        body: {
          id: "business-unit-1",
          status: "Active",
          version: 4,
        },
      });

      const commerceAccounts = yield* CommerceAccounts;
      yield* commerceAccounts.linkRegistrantIdentity({
        acceptedIdentity,
        commerceAccount: registration.commerceAccount,
      });

      expect(mocks.customerPost).toHaveBeenCalledWith({
        body: {
          actions: [
            {
              action: "setExternalId",
              externalId: "user_01KG3ZSVVGPQ0NQ1FBZZJ2HTXV",
            },
          ],
          version: 7,
        },
      });
      expect(mocks.businessUnitPost).toHaveBeenCalledWith({
        body: {
          actions: [
            {
              action: "addAssociate",
              associate: {
                associateRoleAssignments: [
                  {
                    associateRole: {
                      key: "admin",
                      typeId: "associate-role",
                    },
                    inheritance: "Enabled",
                  },
                  {
                    associateRole: {
                      key: "buyer",
                      typeId: "associate-role",
                    },
                    inheritance: "Enabled",
                  },
                ],
                customer: { id: "customer-1", typeId: "customer" },
              },
            },
          ],
          version: 3,
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
              email: "ada@example.com",
              firstName: "Ada",
              id: "customer-1",
              lastName: "Lovelace",
              version: 7,
            },
          })
          .mockResolvedValueOnce({
            body: {
              email: "ada@example.com",
              externalId: "user_01KG3ZSVVGPQ0NQ1FBZZJ2HTXV",
              firstName: "Ada",
              id: "customer-1",
              lastName: "Lovelace",
              version: 8,
            },
          });
        mocks.customerPostExecute.mockRejectedValueOnce({
          body: {
            errors: [
              {
                code: "ConcurrentModification",
                currentVersion: 8,
              },
            ],
          },
          statusCode: 409,
        });
        mocks.businessUnitGetExecute.mockResolvedValueOnce({
          body: {
            associates: [
              {
                associateRoleAssignments: [
                  {
                    associateRole: {
                      key: "admin",
                      typeId: "associate-role",
                    },
                    inheritance: "Enabled",
                  },
                  {
                    associateRole: {
                      key: "buyer",
                      typeId: "associate-role",
                    },
                    inheritance: "Enabled",
                  },
                ],
                customer: { id: "customer-1", typeId: "customer" },
              },
            ],
            id: "business-unit-1",
            version: 3,
          },
        });

        const commerceAccounts = yield* CommerceAccounts;
        yield* commerceAccounts.linkRegistrantIdentity({
          acceptedIdentity,
          commerceAccount: registration.commerceAccount,
        });

        expect(mocks.customerPost).toHaveBeenCalledOnce();
        expect(mocks.customerGet).toHaveBeenCalledTimes(2);
        expect(mocks.businessUnitPost).not.toHaveBeenCalled();
      }).pipe(Effect.provide(layerCommercetoolsCommerceAccounts))
  );

  it.effect("reconciles a concurrently added Business Unit associate", () =>
    Effect.gen(function* () {
      mocks.customerGetExecute.mockResolvedValueOnce({
        body: {
          email: "ada@example.com",
          externalId: "user_01KG3ZSVVGPQ0NQ1FBZZJ2HTXV",
          firstName: "Ada",
          id: "customer-1",
          lastName: "Lovelace",
          version: 8,
        },
      });
      mocks.businessUnitGetExecute
        .mockResolvedValueOnce({
          body: {
            associates: [],
            id: "business-unit-1",
            version: 3,
          },
        })
        .mockResolvedValueOnce({
          body: {
            associates: [
              {
                associateRoleAssignments: [
                  {
                    associateRole: {
                      key: "admin",
                      typeId: "associate-role",
                    },
                    inheritance: "Enabled",
                  },
                  {
                    associateRole: {
                      key: "buyer",
                      typeId: "associate-role",
                    },
                    inheritance: "Enabled",
                  },
                ],
                customer: { id: "customer-1", typeId: "customer" },
              },
            ],
            id: "business-unit-1",
            version: 4,
          },
        });
      mocks.businessUnitPostExecute.mockRejectedValueOnce({
        body: {
          errors: [
            {
              code: "ConcurrentModification",
              currentVersion: 4,
            },
          ],
        },
        statusCode: 409,
      });

      const commerceAccounts = yield* CommerceAccounts;
      yield* commerceAccounts.linkRegistrantIdentity({
        acceptedIdentity,
        commerceAccount: registration.commerceAccount,
      });

      expect(mocks.businessUnitPost).toHaveBeenCalledOnce();
      expect(mocks.businessUnitGet).toHaveBeenCalledTimes(2);
    }).pipe(Effect.provide(layerCommercetoolsCommerceAccounts))
  );

  it.effect("adds the buyer role without removing existing roles", () =>
    Effect.gen(function* () {
      mocks.customerGetExecute.mockResolvedValueOnce({
        body: {
          email: "ada@example.com",
          externalId: "user_01KG3ZSVVGPQ0NQ1FBZZJ2HTXV",
          firstName: "Ada",
          id: "customer-1",
          lastName: "Lovelace",
          version: 8,
        },
      });
      mocks.businessUnitGetExecute.mockResolvedValueOnce({
        body: {
          associates: [
            {
              associateRoleAssignments: [
                {
                  associateRole: {
                    key: "admin",
                    typeId: "associate-role",
                  },
                  inheritance: "Enabled",
                },
                {
                  associateRole: {
                    key: "approver",
                    typeId: "associate-role",
                  },
                  inheritance: "Enabled",
                },
              ],
              customer: { id: "customer-1", typeId: "customer" },
            },
          ],
          id: "business-unit-1",
          status: "Active",
          version: 3,
        },
      });
      mocks.businessUnitPostExecute.mockResolvedValueOnce({
        body: {
          id: "business-unit-1",
          status: "Active",
          version: 4,
        },
      });

      const commerceAccounts = yield* CommerceAccounts;
      yield* commerceAccounts.linkRegistrantIdentity({
        acceptedIdentity,
        commerceAccount: registration.commerceAccount,
      });

      expect(mocks.businessUnitPost).toHaveBeenCalledWith({
        body: {
          actions: [
            {
              action: "changeAssociate",
              associate: {
                associateRoleAssignments: [
                  {
                    associateRole: {
                      key: "admin",
                      typeId: "associate-role",
                    },
                    inheritance: "Enabled",
                  },
                  {
                    associateRole: {
                      key: "approver",
                      typeId: "associate-role",
                    },
                    inheritance: "Enabled",
                  },
                  {
                    associateRole: {
                      key: "buyer",
                      typeId: "associate-role",
                    },
                    inheritance: "Enabled",
                  },
                ],
                customer: { id: "customer-1", typeId: "customer" },
              },
            },
          ],
          version: 3,
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
            email: "ada@example.com",
            externalId: "user_01KG3ZSVVGPQ0NQ1FBZZJ2HTXV",
            firstName: "Ada",
            id: "customer-1",
            lastName: "Lovelace",
            version: 8,
          },
        });
        mocks.businessUnitGetExecute.mockResolvedValueOnce({
          body: {
            associates: [
              {
                associateRoleAssignments: [
                  {
                    associateRole: {
                      key: "admin",
                      typeId: "associate-role",
                    },
                    inheritance: "Enabled",
                  },
                  {
                    associateRole: {
                      key: "buyer",
                      typeId: "associate-role",
                    },
                    inheritance: "Enabled",
                  },
                ],
                customer: { id: "customer-1", typeId: "customer" },
              },
            ],
            id: "business-unit-1",
            status: "Active",
            version: 3,
          },
        });

        const commerceAccounts = yield* CommerceAccounts;
        yield* commerceAccounts.linkRegistrantIdentity({
          acceptedIdentity,
          commerceAccount: registration.commerceAccount,
        });

        expect(mocks.customerPost).not.toHaveBeenCalled();
        expect(mocks.businessUnitPost).not.toHaveBeenCalled();
      }).pipe(Effect.provide(layerCommercetoolsCommerceAccounts))
  );

  it.effect("defects on an invalid owner association response", () =>
    Effect.gen(function* () {
      mocks.customerGetExecute.mockResolvedValueOnce({
        body: {
          email: "ada@example.com",
          externalId: "user_01KG3ZSVVGPQ0NQ1FBZZJ2HTXV",
          firstName: "Ada",
          id: "customer-1",
          lastName: "Lovelace",
          version: 8,
        },
      });
      mocks.businessUnitGetExecute.mockResolvedValueOnce({
        body: {
          associates: [],
          id: "business-unit-1",
          status: "Active",
          version: 3,
        },
      });
      mocks.businessUnitPostExecute.mockRejectedValueOnce({
        body: {
          errors: [
            {
              code: "ReferencedResourceNotFound",
              message: "Referenced resource with key admin was not found.",
            },
          ],
          message: "The referenced associate role does not exist.",
        },
        statusCode: 400,
      });

      const commerceAccounts = yield* CommerceAccounts;
      const exit = yield* commerceAccounts
        .linkRegistrantIdentity({
          acceptedIdentity,
          commerceAccount: registration.commerceAccount,
        })
        .pipe(Effect.exit);

      expect(exit._tag).toBe("Failure");
      if (exit._tag !== "Failure") {
        throw new Error("Expected the invalid provider response to defect");
      }
      const defect = exit.cause.reasons.find(Cause.isDieReason)?.defect;
      expect(defect).toMatchObject({
        cause: {
          body: {
            errors: [
              expect.objectContaining({ code: "ReferencedResourceNotFound" }),
            ],
            message: "The referenced associate role does not exist.",
          },
        },
        message: "Failed to add Commercetools business unit associate",
      });
    }).pipe(Effect.provide(layerCommercetoolsCommerceAccounts))
  );
});
