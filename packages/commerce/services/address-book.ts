import { Context, Effect, Layer, Ref } from "effect";
import {
  type AddressBookAccessDenied,
  AddressBookEntry,
  AddressBookEntryNotFound,
  type AddressBookGetError,
  type AddressBookProviderFailure,
  type AddressBookReadError,
  type AddressBookReference,
  normalizeAddressTypes,
  type SaveAddressBookEntryInput,
} from "../domain/address-book";
import type { CommerceBusinessUnitId } from "../domain/commerce-account";
import type { CustomerCommercePrincipal } from "../domain/commerce-request-context";

export class AddressBook extends Context.Service<
  AddressBook,
  {
    readonly list: (
      principal: CustomerCommercePrincipal
    ) => Effect.Effect<readonly AddressBookEntry[], AddressBookReadError>;
    readonly get: (
      principal: CustomerCommercePrincipal,
      reference: AddressBookReference
    ) => Effect.Effect<AddressBookEntry, AddressBookGetError>;
    readonly save: (
      principal: CustomerCommercePrincipal,
      input: SaveAddressBookEntryInput
    ) => Effect.Effect<
      AddressBookEntry,
      AddressBookAccessDenied | AddressBookProviderFailure
    >;
  }
>()("@repo/commerce/AddressBook") {
  static readonly layerMemory = () =>
    Layer.effect(
      AddressBook,
      Effect.gen(function* () {
        const state = yield* Ref.make<
          ReadonlyMap<CommerceBusinessUnitId, readonly AddressBookEntry[]>
        >(new Map());

        const list = Effect.fn("AddressBook.list")(
          (principal: CustomerCommercePrincipal) =>
            Ref.get(state).pipe(
              Effect.map(
                (current) => current.get(principal.businessUnitId) ?? []
              )
            )
        );

        const get = Effect.fn("AddressBook.get")(function* (
          principal: CustomerCommercePrincipal,
          reference: AddressBookReference
        ) {
          const entries = yield* list(principal);
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
          principal: CustomerCommercePrincipal,
          input: SaveAddressBookEntryInput
        ) {
          const businessUnitId = principal.businessUnitId;
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
