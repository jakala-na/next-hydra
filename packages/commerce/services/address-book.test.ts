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
    businessUnitId: CommerceBusinessUnitId.make(businessUnitId),
    businessUnitKey: CommerceBusinessUnitKey.make(businessUnitKey),
    customerId: CommerceCustomerId.make(`customer-${businessUnitId}`),
  });

const officeAddress = {
  addressLine1: "100 Main Street",
  addressLine2: "Suite 200",
  city: "New York",
  country: CountryCode.make("US"),
  postalCode: "10001",
  region: "NY",
};

const OVERLONG_UNICODE_REFERENCE_LENGTH = 80;
const store = new Store({
  currency: "USD",
  locale: CommerceLocale.make("en-US"),
  storeKey: StoreKey.make("default-store"),
});

const provideAddressBook = <A, E>(
  program: Effect.Effect<A, E, AddressBook>,
  buyer = principal("business-unit-1")
) => {
  const request = new CustomerCommerceContextRequest({
    authUserId: buyer.authUserId,
    businessUnitId: buyer.businessUnitId,
    store,
  });
  const commerceContext = CommerceContext.layer(request).pipe(
    Layer.provide(
      CommerceAccounts.layerMemoryFrom({
        businessUnitMemberships: [
          {
            customerId: buyer.customerId,
            membership: new CommerceBusinessUnitMembership({
              businessUnitId: buyer.businessUnitId,
              businessUnitKey: buyer.businessUnitKey,
              businessUnitLabel:
                CommerceBusinessUnitLabel.make("Business Unit One"),
            }),
            storeKey: store.storeKey,
          },
        ],
        customers: [
          { authUserId: buyer.authUserId, customerId: buyer.customerId },
        ],
      })
    )
  );
  const addressBook = AddressBook.layerMemory().pipe(
    Layer.provide(commerceContext)
  );
  return program.pipe(Effect.provide(addressBook));
};

describe(AddressBook, () => {
  it("keeps references provider-neutral and entries internally consistent", () => {
    expect(AddressBookReference.make("office_123")).toBe("office_123");
    expect(() => AddressBookReference.make("office/address")).toThrow();
    expect(() =>
      AddressBookReference.make("🚀".repeat(OVERLONG_UNICODE_REFERENCE_LENGTH))
    ).toThrow();
    expect(
      () =>
        new AddressBookEntry({
          address: officeAddress,
          defaultBilling: false,
          defaultShipping: true,
          reference: AddressBookReference.make("office"),
          types: ["billing"],
        })
    ).toThrow();
    expect(
      () =>
        new AddressBookEntry({
          address: officeAddress,
          defaultBilling: false,
          defaultShipping: false,
          reference: AddressBookReference.make("duplicate-types"),
          types: ["shipping", "shipping"],
        })
    ).toThrow();
  });

  it.effect(
    "stores universal address types and promotes defaults to types",
    () =>
      Effect.gen(function* () {
        const addressBook = yield* AddressBook;

        const saved = yield* addressBook.save({
          address: officeAddress,
          defaultBilling: true,
          defaultShipping: true,
          reference: AddressBookReference.make("office"),
          types: ["billing"],
        });

        expect(saved).toEqual({
          address: officeAddress,
          defaultBilling: true,
          defaultShipping: true,
          reference: "office",
          types: ["shipping", "billing"],
        });
        expect(yield* addressBook.list()).toStrictEqual([saved]);
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
          address: officeAddress,
          defaultBilling: false,
          defaultShipping: false,
          reference,
          types: ["shipping"],
        });
        const repeated = yield* addressBook.save({
          address: {
            ...officeAddress,
            addressLine1: "A different submitted address",
          },
          defaultBilling: true,
          defaultShipping: false,
          reference,
          types: ["billing"],
        });

        expect(repeated).toStrictEqual(first);
        expect(yield* addressBook.list()).toStrictEqual([first]);
      }).pipe(provideAddressBook)
  );

  it.effect("moves each default marker to the newest default entry", () =>
    Effect.gen(function* () {
      const addressBook = yield* AddressBook;

      yield* addressBook.save({
        address: officeAddress,
        defaultBilling: true,
        defaultShipping: true,
        reference: AddressBookReference.make("first"),
        types: ["shipping", "billing"],
      });
      yield* addressBook.save({
        address: {
          ...officeAddress,
          addressLine1: "200 Broadway",
        },
        defaultBilling: false,
        defaultShipping: true,
        reference: AddressBookReference.make("second"),
        types: ["shipping"],
      });

      expect(yield* addressBook.list()).toStrictEqual([
        expect.objectContaining({
          defaultBilling: true,
          defaultShipping: false,
          reference: "first",
        }),
        expect.objectContaining({
          defaultBilling: false,
          defaultShipping: true,
          reference: "second",
        }),
      ]);
    }).pipe(provideAddressBook)
  );
});
