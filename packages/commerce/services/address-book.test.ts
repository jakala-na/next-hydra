import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { CountryCode } from "../domain/address";
import {
  AddressBookEntry,
  AddressBookEntryNotFound,
  AddressBookReference,
} from "../domain/address-book";
import {
  CommerceBusinessUnitId,
  CommerceBusinessUnitKey,
  CommerceCustomerId,
} from "../domain/commerce-account";
import {
  AuthUserId,
  CustomerCommercePrincipal,
} from "../domain/commerce-request-context";
import { AddressBook } from "./address-book";

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
        const buyer = principal("business-unit-1");

        const saved = yield* addressBook.save(buyer, {
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
        expect(yield* addressBook.list(buyer)).toEqual([saved]);
      }).pipe(Effect.provide(AddressBook.layerMemory()))
  );

  it.effect("keeps entries isolated to their verified Business Unit", () =>
    Effect.gen(function* () {
      const addressBook = yield* AddressBook;
      const acmeBuyer = principal("acme");
      const otherBuyer = principal("other");
      const reference = AddressBookReference.make("warehouse");

      yield* addressBook.save(acmeBuyer, {
        reference,
        address: officeAddress,
        types: ["shipping"],
        defaultShipping: false,
        defaultBilling: false,
      });

      expect(yield* addressBook.list(otherBuyer)).toEqual([]);

      const error = yield* addressBook
        .get(otherBuyer, reference)
        .pipe(Effect.flip);
      expect(error).toBeInstanceOf(AddressBookEntryNotFound);
    }).pipe(Effect.provide(AddressBook.layerMemory()))
  );

  it.effect(
    "returns the first canonical entry when a reference is saved again",
    () =>
      Effect.gen(function* () {
        const addressBook = yield* AddressBook;
        const buyer = principal("business-unit-1");
        const reference = AddressBookReference.make("office");

        const first = yield* addressBook.save(buyer, {
          reference,
          address: officeAddress,
          types: ["shipping"],
          defaultShipping: false,
          defaultBilling: false,
        });
        const repeated = yield* addressBook.save(buyer, {
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
        expect(yield* addressBook.list(buyer)).toEqual([first]);
      }).pipe(Effect.provide(AddressBook.layerMemory()))
  );

  it.effect("moves each default marker to the newest default entry", () =>
    Effect.gen(function* () {
      const addressBook = yield* AddressBook;
      const buyer = principal("business-unit-1");

      yield* addressBook.save(buyer, {
        reference: AddressBookReference.make("first"),
        address: officeAddress,
        types: ["shipping", "billing"],
        defaultShipping: true,
        defaultBilling: true,
      });
      yield* addressBook.save(buyer, {
        reference: AddressBookReference.make("second"),
        address: {
          ...officeAddress,
          addressLine1: "200 Broadway",
        },
        types: ["shipping"],
        defaultShipping: true,
        defaultBilling: false,
      });

      expect(yield* addressBook.list(buyer)).toEqual([
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
    }).pipe(Effect.provide(AddressBook.layerMemory()))
  );
});
