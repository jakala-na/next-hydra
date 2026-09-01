import {
  StoreError,
  VersionedKeyValueStore,
  VersionedStoreKey,
} from "@repo/versioned-store";
import { Context, Effect, Layer, Option, Schema } from "effect";

import { PaymentProvider, PaymentProviderFailure } from "../domain";
import type { PaymentAccountReference } from "../domain";

export const DEFAULT_ACCOUNT_CREDIT_STORE_CONTAINER = "checkout-net-terms";

export const CreditProfile = Schema.Struct({
  availableCredit: Schema.Struct({
    centAmount: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    currencyCode: Schema.String.check(Schema.isPattern(/^[A-Z]{3}$/u)),
  }),
  termsInDays: Schema.Int.check(Schema.isGreaterThan(0)),
});
export type CreditProfile = typeof CreditProfile.Type;

export type AccountCreditProfile = CreditProfile & {
  readonly provider: PaymentProvider;
};

const accountCreditProfile = (
  profile: CreditProfile,
  provider: PaymentProvider
): AccountCreditProfile => ({
  ...profile,
  provider,
});

const accountCreditFailureReason = (
  cause: unknown
): PaymentProviderFailure["reason"] => {
  if (Schema.isSchemaError(cause)) {
    return "invalidData";
  }
  if (Schema.is(StoreError)(cause)) {
    return cause.reason;
  }
  return "unexpectedResponse";
};

const accountCreditFailure = (cause: unknown) =>
  new PaymentProviderFailure({
    cause,
    operation: "accountCredit.find",
    reason: accountCreditFailureReason(cause),
  });

export class AccountCredit extends Context.Service<
  AccountCredit,
  {
    readonly find: (
      accountReference: PaymentAccountReference
    ) => Effect.Effect<
      Option.Option<AccountCreditProfile>,
      PaymentProviderFailure
    >;
  }
>()("@repo/payments/AccountCredit") {
  static readonly layerMemory = (
    profiles: ReadonlyMap<PaymentAccountReference, CreditProfile>,
    provider = "MemoryAccountCredit"
  ) => {
    const paymentProvider = PaymentProvider.make(provider);
    return Layer.succeed(
      AccountCredit,
      AccountCredit.of({
        find: Effect.fn("AccountCredit.memory.find")((accountReference) =>
          Effect.succeed(
            Option.fromNullishOr(profiles.get(accountReference)).pipe(
              Option.map((profile) =>
                accountCreditProfile(profile, paymentProvider)
              )
            )
          )
        ),
      })
    );
  };

  static readonly layerVersionedStore = (provider = "ExternalLedger") =>
    Layer.effect(
      AccountCredit,
      Effect.gen(function* () {
        const store = yield* VersionedKeyValueStore;
        const paymentProvider = PaymentProvider.make(provider);

        return AccountCredit.of({
          find: Effect.fn("AccountCredit.versionedStore.find")(
            (accountReference) =>
              Schema.decodeEffect(VersionedStoreKey)(accountReference).pipe(
                Effect.flatMap((key) => store.get(key, CreditProfile)),
                Effect.map(
                  Option.map(({ value }) =>
                    accountCreditProfile(value, paymentProvider)
                  )
                ),
                Effect.mapError(accountCreditFailure)
              )
          ),
        });
      })
    );
}
