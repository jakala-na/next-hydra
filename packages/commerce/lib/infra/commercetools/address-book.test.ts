import type {
  BusinessUnit,
  BusinessUnitUpdate,
  ByProjectKeyRequestBuilder,
} from "@commercetools/platform-sdk";
import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { vi } from "vitest";
import { CountryCode } from "../../../domain/address";
import {
  AddressBookAccessDenied,
  AddressBookEntryNotFound,
  AddressBookReference,
} from "../../../domain/address-book";
import {
  CommerceBusinessUnitId,
  CommerceBusinessUnitKey,
  CommerceCustomerId,
} from "../../../domain/commerce-account";
import {
  AuthUserId,
  CustomerCommercePrincipal,
} from "../../../domain/commerce-request-context";
import { AddressBook } from "../../../services/address-book";
import {
  layerCommercetoolsAddressBookFor,
  toCommercetoolsAddressKey,
} from "./address-book";

vi.mock("../../client/api-root", () => ({
  apiRootWithoutConcurrentModificationRetry: {},
}));

const buyer = new CustomerCommercePrincipal({
  authUserId: AuthUserId.make("auth-user-1"),
  customerId: CommerceCustomerId.make("customer-1"),
  businessUnitId: CommerceBusinessUnitId.make("business-unit-1"),
  businessUnitKey: CommerceBusinessUnitKey.make("business-unit-key-1"),
});

const address = {
  addressLine1: "100 Main Street",
  addressLine2: "Suite 200",
  postalCode: "10001",
  city: "New York",
  region: "NY",
  country: CountryCode.make("US"),
};

const reference = AddressBookReference.make("office");

const businessUnit = (overrides: Partial<BusinessUnit> = {}): BusinessUnit =>
  ({
    id: "business-unit-1",
    version: 3,
    key: "business-unit-key-1",
    addresses: [
      {
        id: "address-1",
        key: toCommercetoolsAddressKey(reference),
        streetName: address.addressLine1,
        additionalStreetInfo: address.addressLine2,
        postalCode: address.postalCode,
        city: address.city,
        region: address.region,
        country: address.country,
      },
    ],
    shippingAddressIds: ["address-1"],
    billingAddressIds: ["address-1"],
    defaultShippingAddressId: "address-1",
    defaultBillingAddressId: "address-1",
    ...overrides,
  }) as unknown as BusinessUnit;

const apiRootForBusinessUnit = () => {
  const getExecute = vi.fn();
  const postExecute = vi.fn();
  const get = vi.fn(() => ({ execute: getExecute }));
  const post = vi.fn((_request: { readonly body: BusinessUnitUpdate }) => ({
    execute: postExecute,
  }));
  const withKey = vi.fn(() => ({ get, post }));
  const businessUnits = vi.fn(() => ({ withKey }));
  const withAssociateIdValue = vi.fn(() => ({ businessUnits }));
  const asAssociate = vi.fn(() => ({ withAssociateIdValue }));
  const apiRoot = { asAssociate } as unknown as ByProjectKeyRequestBuilder;

  return {
    apiRoot,
    asAssociate,
    withAssociateIdValue,
    businessUnits,
    withKey,
    get,
    getExecute,
    post,
    postExecute,
  };
};

describe("layerCommercetoolsAddressBookFor", () => {
  it.effect(
    "lists canonical entries through the verified associate scope",
    () =>
      Effect.gen(function* () {
        const api = apiRootForBusinessUnit();
        api.getExecute.mockResolvedValueOnce({
          body: businessUnit({
            shippingAddressIds: [],
            billingAddressIds: [],
          }),
        });

        return yield* Effect.gen(function* () {
          const addressBook = yield* AddressBook;
          const entries = yield* addressBook.list(buyer);

          expect(entries).toEqual([
            {
              reference: "office",
              address,
              types: ["shipping", "billing"],
              defaultShipping: true,
              defaultBilling: true,
            },
          ]);
          expect(api.withAssociateIdValue).toHaveBeenCalledWith({
            associateId: "customer-1",
          });
          expect(api.withKey).toHaveBeenCalledWith({
            key: "business-unit-key-1",
          });
        }).pipe(Effect.provide(layerCommercetoolsAddressBookFor(api.apiRoot)));
      })
  );

  it.effect(
    "returns the existing canonical entry without another write",
    () => {
      const api = apiRootForBusinessUnit();
      api.getExecute.mockResolvedValueOnce({ body: businessUnit() });

      return Effect.gen(function* () {
        const addressBook = yield* AddressBook;
        const saved = yield* addressBook.save(buyer, {
          reference,
          address: { ...address, addressLine1: "Different submission" },
          types: ["billing"],
          defaultShipping: false,
          defaultBilling: false,
        });

        expect(saved.address.addressLine1).toBe("100 Main Street");
        expect(saved.types).toEqual(["shipping", "billing"]);
        expect(api.post).not.toHaveBeenCalled();
      }).pipe(Effect.provide(layerCommercetoolsAddressBookFor(api.apiRoot)));
    }
  );

  it.effect(
    "adds an address and requested markers in one versioned update",
    () => {
      const api = apiRootForBusinessUnit();
      api.getExecute.mockResolvedValueOnce({
        body: businessUnit({
          addresses: [],
          shippingAddressIds: [],
          billingAddressIds: [],
          defaultShippingAddressId: undefined,
          defaultBillingAddressId: undefined,
        }),
      });
      api.postExecute.mockResolvedValueOnce({ body: businessUnit() });

      return Effect.gen(function* () {
        const addressBook = yield* AddressBook;
        const saved = yield* addressBook.save(buyer, {
          reference,
          address,
          types: ["billing"],
          defaultShipping: true,
          defaultBilling: true,
        });

        expect(saved.reference).toBe(reference);
        expect(api.post).toHaveBeenCalledWith({
          body: {
            version: 3,
            actions: [
              {
                action: "addAddress",
                address: {
                  key: toCommercetoolsAddressKey(reference),
                  streetName: address.addressLine1,
                  additionalStreetInfo: address.addressLine2,
                  postalCode: address.postalCode,
                  city: address.city,
                  region: address.region,
                  country: address.country,
                },
              },
              {
                action: "addShippingAddressId",
                addressKey: toCommercetoolsAddressKey(reference),
              },
              {
                action: "addBillingAddressId",
                addressKey: toCommercetoolsAddressKey(reference),
              },
              {
                action: "setDefaultShippingAddress",
                addressKey: toCommercetoolsAddressKey(reference),
              },
              {
                action: "setDefaultBillingAddress",
                addressKey: toCommercetoolsAddressKey(reference),
              },
            ],
          },
        });
      }).pipe(Effect.provide(layerCommercetoolsAddressBookFor(api.apiRoot)));
    }
  );

  it.effect("returns a typed not-found error for an absent reference", () => {
    const api = apiRootForBusinessUnit();
    api.getExecute.mockResolvedValueOnce({
      body: businessUnit({ addresses: [] }),
    });

    return Effect.gen(function* () {
      const addressBook = yield* AddressBook;
      const error = yield* addressBook.get(buyer, reference).pipe(Effect.flip);

      expect(error).toBeInstanceOf(AddressBookEntryNotFound);
    }).pipe(Effect.provide(layerCommercetoolsAddressBookFor(api.apiRoot)));
  });

  it.effect(
    "keeps keyed addresses without an Address Type outside the catalog",
    () => {
      const api = apiRootForBusinessUnit();
      const untypedReference = AddressBookReference.make("untyped");
      const current = businessUnit();
      const firstAddress = current.addresses[0];
      if (!firstAddress) {
        throw new Error("Business Unit fixture requires an address");
      }
      const untypedAddress = {
        ...firstAddress,
        id: "address-2",
        key: toCommercetoolsAddressKey(untypedReference),
      };
      const withUntypedAddress = businessUnit({
        addresses: [...current.addresses, untypedAddress],
      });
      api.getExecute
        .mockResolvedValueOnce({ body: withUntypedAddress })
        .mockResolvedValueOnce({ body: withUntypedAddress });

      return Effect.gen(function* () {
        const addressBook = yield* AddressBook;

        expect(yield* addressBook.list(buyer)).toHaveLength(1);
        const error = yield* addressBook
          .get(buyer, untypedReference)
          .pipe(Effect.flip);
        expect(error).toBeInstanceOf(AddressBookEntryNotFound);
      }).pipe(Effect.provide(layerCommercetoolsAddressBookFor(api.apiRoot)));
    }
  );

  it.effect("preserves associate access denial as a typed error", () => {
    const api = apiRootForBusinessUnit();
    api.getExecute.mockRejectedValueOnce({
      statusCode: 403,
      code: "AssociateMissingPermission",
    });

    return Effect.gen(function* () {
      const addressBook = yield* AddressBook;
      const error = yield* addressBook.list(buyer).pipe(Effect.flip);

      expect(error).toBeInstanceOf(AddressBookAccessDenied);
      expect(error.operation).toBe("list");
    }).pipe(Effect.provide(layerCommercetoolsAddressBookFor(api.apiRoot)));
  });

  it.effect(
    "recovers an entry that exists after an ambiguous write failure",
    () => {
      const api = apiRootForBusinessUnit();
      api.getExecute
        .mockResolvedValueOnce({
          body: businessUnit({
            addresses: [],
            shippingAddressIds: [],
            billingAddressIds: [],
            defaultShippingAddressId: undefined,
            defaultBillingAddressId: undefined,
          }),
        })
        .mockResolvedValueOnce({ body: businessUnit() });
      api.postExecute.mockRejectedValueOnce({ statusCode: 503 });

      return Effect.gen(function* () {
        const addressBook = yield* AddressBook;
        const saved = yield* addressBook.save(buyer, {
          reference,
          address,
          types: ["shipping", "billing"],
          defaultShipping: true,
          defaultBilling: true,
        });

        expect(saved.reference).toBe(reference);
        expect(api.post).toHaveBeenCalledTimes(1);
        expect(api.get).toHaveBeenCalledTimes(2);
      }).pipe(Effect.provide(layerCommercetoolsAddressBookFor(api.apiRoot)));
    }
  );

  it.effect(
    "retries once when reconciliation confirms the entry is absent",
    () => {
      const api = apiRootForBusinessUnit();
      const withoutAddresses = businessUnit({
        version: 3,
        addresses: [],
        shippingAddressIds: [],
        billingAddressIds: [],
        defaultShippingAddressId: undefined,
        defaultBillingAddressId: undefined,
      });
      api.getExecute
        .mockResolvedValueOnce({ body: withoutAddresses })
        .mockResolvedValueOnce({
          body: businessUnit({ ...withoutAddresses, version: 4 }),
        });
      api.postExecute
        .mockRejectedValueOnce({ statusCode: 409 })
        .mockResolvedValueOnce({ body: businessUnit({ version: 5 }) });

      return Effect.gen(function* () {
        const addressBook = yield* AddressBook;
        const saved = yield* addressBook.save(buyer, {
          reference,
          address,
          types: ["shipping"],
          defaultShipping: false,
          defaultBilling: false,
        });

        expect(saved.reference).toBe(reference);
        expect(api.post).toHaveBeenCalledTimes(2);
        expect(api.get).toHaveBeenCalledTimes(2);
      }).pipe(Effect.provide(layerCommercetoolsAddressBookFor(api.apiRoot)));
    }
  );
});
