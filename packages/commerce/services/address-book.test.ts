import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { CountryCode } from "../domain/address";
import { AddressBookEntry, AddressBookReference } from "../domain/address-book";
import {
  CommerceBusinessUnitId,
  CommerceBusinessUnitKey,
  CommerceBusinessUnitLabel,
  CommerceBusinessUnitMembership,
  CommerceCustomerId,
} from "../domain/commerce-account";
import {
  AnonymousCommerceContextRequest,
  AuthUserId,
  CustomerCommerceContextRequest,
  CustomerCommercePrincipal,
} from "../domain/commerce-request-context";
import { CommerceLocale, Store, StoreKey } from "../store";
import { AddressBook } from "./address-book";
import { CommerceAccounts } from "./commerce-accounts";
import { CommerceContext } from "./commerce-context";

const principal = (businessUnitId: string, businessUnitKey = businessUnitId) =>
  new CustomerCommercePrincipal({
    authUserId: AuthUserId.make(`auth-${businessUnitId}`),
    customerId: CommerceCustomerId.make(`customer-${businessUnitId}`),
    businessUnitId: CommerceBusinessUnitId.make(businessUnitId),
    businessUnitKey: CommerceBusinessUnitKey.make(businessUnitKey),
  });

const officeAddress = {
  addressLine1: "100 Main Street",
  addressLine2: "Suite 200",
  postalCode: "10001",
  city: "New York",
  region: "NY",
  country: CountryCode.make("US"),
};

const OVERLONG_UNICODE_REFERENCE_LENGTH = 80;
const store = new Store({
  locale: CommerceLocale.make("en-US"),
  storeKey: StoreKey.make("default-store"),
  currency: "USD",
});

const provideAddressBook = <A, E>(
  program: Effect.Effect<A, E, AddressBook>,
  buyer = principal("business-unit-1")
) => {
  const request = new CustomerCommerceContextRequest({
    store,
    authUserId: buyer.authUserId,
    businessUnitId: buyer.businessUnitId,
  });
  const commerceContext = CommerceContext.layer(request).pipe(
    Layer.provide(
      CommerceAccounts.layerMemoryFrom({
        customers: [
          { authUserId: buyer.authUserId, customerId: buyer.customerId },
        ],
        businessUnitMemberships: [
          {
            customerId: buyer.customerId,
            storeKey: store.storeKey,
            membership: new CommerceBusinessUnitMembership({
              businessUnitId: buyer.businessUnitId,
              businessUnitKey: buyer.businessUnitKey,
              businessUnitLabel:
                CommerceBusinessUnitLabel.make("Business Unit One"),
            }),
          },
        ],
      })
    )
  );
  const addressBook = AddressBook.layerMemory().pipe(
    Layer.provide(commerceContext)
  );
  return program.pipe(Effect.provide(addressBook));
};

describe("AddressBook", () => {
  it("keeps references provider-neutral and entries internally consistent", () => {
    expect(AddressBookReference.make("office_123")).toBe("office_123");
    expect(() => AddressBookReference.make("office/address")).toThrow();
    expect(() =>
      AddressBookReference.make("🚀".repeat(OVERLONG_UNICODE_REFERENCE_LENGTH))
    ).toThrow();
    expect(
      () =>
        new AddressBookEntry({
          reference: AddressBookReference.make("office"),
          address: officeAddress,
          types: ["billing"],
          defaultShipping: true,
          defaultBilling: false,
        })
    ).toThrow();
    expect(
      () =>
        new AddressBookEntry({
          reference: AddressBookReference.make("duplicate-types"),
          address: officeAddress,
          types: ["shipping", "shipping"],
          defaultShipping: false,
          defaultBilling: false,
        })
    ).toThrow();
  });

  it.effect(
    "stores universal address types and promotes defaults to types",
    () =>
      Effect.gen(function* () {
        const addressBook = yield* AddressBook;

        const saved = yield* addressBook.save({
          reference: AddressBookReference.make("office"),
          address: officeAddress,
          types: ["billing"],
          defaultShipping: true,
          defaultBilling: true,
        });

        expect(saved).toEqual({
          reference: "office",
          address: officeAddress,
          types: ["shipping", "billing"],
          defaultShipping: true,
          defaultBilling: true,
        });
        expect(yield* addressBook.list()).toEqual([saved]);
      }).pipe(provideAddressBook)
  );

  it.effect("reports no customer principal for an anonymous request", () => {
    const request = new AnonymousCommerceContextRequest({ store });
    const commerceContext = CommerceContext.layer(request).pipe(
      Layer.provide(CommerceAccounts.layerMemoryFrom({}))
    );
    const addressBook = AddressBook.layerMemory().pipe(
      Layer.provide(commerceContext)
    );

    return Effect.gen(function* () {
      const error = yield* Effect.flip(AddressBook.list());
      expect(error).toMatchObject({
        _tag: "CommerceRequestContextNotFound",
        reason: "noPrincipal",
      });
    }).pipe(Effect.provide(addressBook));
  });

  it.effect(
    "returns the first canonical entry when a reference is saved again",
    () =>
      Effect.gen(function* () {
        const addressBook = yield* AddressBook;
        const reference = AddressBookReference.make("office");

        const first = yield* addressBook.save({
          reference,
          address: officeAddress,
          types: ["shipping"],
          defaultShipping: false,
          defaultBilling: false,
        });
        const repeated = yield* addressBook.save({
          reference,
          address: {
            ...officeAddress,
            addressLine1: "A different submitted address",
          },
          types: ["billing"],
          defaultShipping: false,
          defaultBilling: true,
        });

        expect(repeated).toEqual(first);
        expect(yield* addressBook.list()).toEqual([first]);
      }).pipe(provideAddressBook)
  );

  it.effect("moves each default marker to the newest default entry", () =>
    Effect.gen(function* () {
      const addressBook = yield* AddressBook;

      yield* addressBook.save({
        reference: AddressBookReference.make("first"),
        address: officeAddress,
        types: ["shipping", "billing"],
        defaultShipping: true,
        defaultBilling: true,
      });
      yield* addressBook.save({
        reference: AddressBookReference.make("second"),
        address: {
          ...officeAddress,
          addressLine1: "200 Broadway",
        },
        types: ["shipping"],
        defaultShipping: true,
        defaultBilling: false,
      });

      expect(yield* addressBook.list()).toEqual([
        expect.objectContaining({
          reference: "first",
          defaultShipping: false,
          defaultBilling: true,
        }),
        expect.objectContaining({
          reference: "second",
          defaultShipping: true,
          defaultBilling: false,
        }),
      ]);
    }).pipe(provideAddressBook)
  );
});
