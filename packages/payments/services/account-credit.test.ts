import { describe, expect, it } from "@effect/vitest";
import {
  StoreError,
  VersionedKeyValueStore,
  VersionedStoreKey,
} from "@repo/versioned-store";
import { Effect, Layer, Option } from "effect";

import {
  PaymentAccountReference,
  PaymentAttemptReference,
  PaymentCheckoutReference,
} from "../domain";
import { AccountCredit, CreditProfile } from "./account-credit";

const accountReference = PaymentAccountReference.make("account-under-test");

const testLayer = AccountCredit.layerVersionedStore("Demo ERP Ledger").pipe(
  Layer.provideMerge(VersionedKeyValueStore.layerMemory)
);

describe(AccountCredit, () => {
  it.effect(
    "reads a schema-validated Credit Profile from a Versioned Key Value Store",
    () =>
      Effect.gen(function* () {
        const store = yield* VersionedKeyValueStore;
        const accountCredit = yield* AccountCredit;
        yield* store.insert(
          VersionedStoreKey.make(accountReference),
          CreditProfile,
          {
            availableCredit: {
              centAmount: 2_000_000,
              currencyCode: "USD",
            },
            termsInDays: 30,
          }
        );

        const profile = yield* accountCredit.find(accountReference);

        expect(Option.getOrThrow(profile)).toStrictEqual({
          authorizations: [],
          availableCredit: {
            centAmount: 2_000_000,
            currencyCode: "USD",
          },
          ledger: [],
          provider: "Demo ERP Ledger",
          termsInDays: 30,
        });
        expect(
          yield* accountCredit.preparePayment({
            accountReference,
            attemptReference: PaymentAttemptReference.make("attempt-1"),
            checkout: {
              amount: { centAmount: 1_700_000, currencyCode: "USD" },
              reference: PaymentCheckoutReference.make("checkout-1"),
            },
          })
        ).toStrictEqual({
          provider: "Demo ERP Ledger",
          providerReference: "credit-account-under-test-attempt-1",
        });
      }).pipe(Effect.provide(testLayer))
  );

  it.effect("preserves unexpected store responses as provider defects", () => {
    const storeFailure = new StoreError({
      cause: new Error("ERP returned an unsupported response"),
      key: accountReference,
      message: "ERP returned an unsupported response",
      operation: "read",
      reason: "unexpectedResponse",
    });
    const failingStore = Layer.succeed(
      VersionedKeyValueStore,
      VersionedKeyValueStore.of({
        get: () => Effect.fail(storeFailure),
        insert: () => Effect.die("not used"),
        remove: () => Effect.die("not used"),
        update: () => Effect.die("not used"),
        values: () => Effect.die("not used"),
      })
    );

    return Effect.gen(function* () {
      const accountCredit = yield* AccountCredit;
      const failure = yield* accountCredit
        .find(accountReference)
        .pipe(Effect.flip);

      expect(failure).toMatchObject({
        _tag: "PaymentProviderFailure",
        operation: "accountCredit.find",
        reason: "unexpectedResponse",
      });
    }).pipe(
      Effect.provide(
        AccountCredit.layerVersionedStore("Demo ERP Ledger").pipe(
          Layer.provide(failingStore)
        )
      )
    );
  });
});
