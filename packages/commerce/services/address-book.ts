import { Context, Effect, Layer, Ref } from "effect";

import {
  type AddressBookAccessDenied,
  AddressBookEntry,
  AddressBookEntryNotFound,
  type AddressBookGetError,
  type AddressBookProviderFailure,
  type AddressBookReadError,
  type AddressBookReference,
  type AddressBookWriteOutcomeUnknown,
  normalizeAddressTypes,
  type SaveAddressBookEntryInput,
} from "../domain/address-book";
import type { CommerceBusinessUnitId } from "../domain/commerce-account";
import type { CommerceRequestContextNotFound } from "../domain/commerce-request-context";
import { CommerceContext } from "./commerce-context";

export type AddressBookListFailure =
  | AddressBookReadError
  | CommerceRequestContextNotFound;

export type AddressBookGetFailure =
  | AddressBookGetError
  | CommerceRequestContextNotFound;

export type AddressBookSaveFailure =
  | AddressBookAccessDenied
  | AddressBookProviderFailure
  | AddressBookWriteOutcomeUnknown
  | CommerceRequestContextNotFound;

export class AddressBook extends Context.Service<
  AddressBook,
  {
    readonly list: () => Effect.Effect<
      readonly AddressBookEntry[],
      AddressBookListFailure
    >;
    readonly get: (
      reference: AddressBookReference
    ) => Effect.Effect<AddressBookEntry, AddressBookGetFailure>;
    readonly save: (
      input: SaveAddressBookEntryInput
    ) => Effect.Effect<AddressBookEntry, AddressBookSaveFailure>;
  }
>()("@repo/commerce/AddressBook") {
  static readonly list = Effect.fn("AddressBook.list")(() =>
    Effect.flatMap(AddressBook, (addressBook) => addressBook.list())
  );

  static readonly get = Effect.fn("AddressBook.get")(
    (reference: AddressBookReference) =>
      Effect.flatMap(AddressBook, (addressBook) => addressBook.get(reference))
  );

  static readonly save = Effect.fn("AddressBook.save")(
    (input: SaveAddressBookEntryInput) =>
      Effect.flatMap(AddressBook, (addressBook) => addressBook.save(input))
  );

  static readonly layerMemory = () =>
    Layer.effect(
      AddressBook,
      Effect.gen(function* () {
        const commerceContext = yield* CommerceContext;
        const state = yield* Ref.make<
          ReadonlyMap<CommerceBusinessUnitId, readonly AddressBookEntry[]>
        >(new Map());

        const list = Effect.fn("AddressBook.list")(function* () {
          const customerPrincipal = yield* commerceContext.customerPrincipal();
          const current = yield* Ref.get(state);
          return current.get(customerPrincipal.businessUnitId) ?? [];
        });

        const get = Effect.fn("AddressBook.get")(function* (
          reference: AddressBookReference
        ) {
          const entries = yield* list();
          const entry = entries.find(
            (candidate) => candidate.reference === reference
          );

          if (!entry) {
            return yield* new AddressBookEntryNotFound({
              message: "Address Book entry does not exist",
              reference,
            });
          }

          return entry;
        });

        const save = Effect.fn("AddressBook.save")(function* (
          input: SaveAddressBookEntryInput
        ) {
          const customerPrincipal = yield* commerceContext.customerPrincipal();
          const businessUnitId = customerPrincipal.businessUnitId;
          const current = yield* Ref.get(state);
          const entries = current.get(businessUnitId) ?? [];
          const existing = entries.find(
            (candidate) => candidate.reference === input.reference
          );

          if (existing) {
            return existing;
          }

          const entry = new AddressBookEntry({
            ...input,
            types: normalizeAddressTypes(input.types, input),
          });
          const previousEntries = entries.map(
            (candidate) =>
              new AddressBookEntry({
                ...candidate,
                defaultShipping: input.defaultShipping
                  ? false
                  : candidate.defaultShipping,
                defaultBilling: input.defaultBilling
                  ? false
                  : candidate.defaultBilling,
              })
          );

          yield* Ref.set(
            state,
            new Map(current).set(businessUnitId, [...previousEntries, entry])
          );

          return entry;
        });

        return AddressBook.of({ list, get, save });
      })
    );
}
