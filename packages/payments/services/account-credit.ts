import {
  StoreError,
  VersionedKeyValueStore,
  VersionedStoreKey,
} from "@repo/versioned-store";
import { Context, Effect, Layer, Option, Ref, Schema } from "effect";

import {
  CreditAuthorizationReference,
  PaymentProviderReference,
  PaymentOperationDeclined,
  PaymentProvider,
  PaymentProviderFailure,
} from "../domain";
import type {
  PaymentAccountReference,
  PaymentAmount,
  PaymentAttemptReference,
  PaymentCheckout,
  PaymentOperationReference,
  PaymentOrderReference,
} from "../domain";

export const DEFAULT_ACCOUNT_CREDIT_STORE_CONTAINER = "checkout-net-terms";

export const CreditAuthorization = Schema.Struct({
  amount: Schema.Struct({
    centAmount: Schema.Int.check(Schema.isGreaterThan(0)),
    currencyCode: Schema.String.check(Schema.isPattern(/^[A-Z]{3}$/u)),
  }),
  operationReference: Schema.String,
  reference: CreditAuthorizationReference,
  state: Schema.Literals(["reserved", "committed", "cancelled"]),
});
export type CreditAuthorization = typeof CreditAuthorization.Type;

export const CreditLedgerEntry = Schema.Struct({
  amount: Schema.Struct({
    centAmount: Schema.Int.check(Schema.isGreaterThan(0)),
    currencyCode: Schema.String.check(Schema.isPattern(/^[A-Z]{3}$/u)),
  }),
  direction: Schema.Literals(["debit", "credit"]),
  orderReference: Schema.optional(Schema.String),
  reference: Schema.String,
});
export type CreditLedgerEntry = typeof CreditLedgerEntry.Type;

export const CreditProfile = Schema.Struct({
  authorizations: Schema.optional(Schema.Array(CreditAuthorization)),
  availableCredit: Schema.Struct({
    centAmount: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    currencyCode: Schema.String.check(Schema.isPattern(/^[A-Z]{3}$/u)),
  }),
  ledger: Schema.optional(Schema.Array(CreditLedgerEntry)),
  termsInDays: Schema.Int.check(Schema.isGreaterThan(0)),
});
export type CreditProfile = typeof CreditProfile.Type;

export type AccountCreditProfile = CreditProfile & {
  readonly authorizations: readonly CreditAuthorization[];
  readonly ledger: readonly CreditLedgerEntry[];
  readonly provider: PaymentProvider;
};

export interface AuthorizeAccountCreditInput {
  readonly accountReference: PaymentAccountReference;
  readonly amount: PaymentAmount;
  readonly operationReference: PaymentOperationReference;
}

export interface CompleteAccountCreditInput {
  readonly accountReference: PaymentAccountReference;
  readonly authorizationReference: CreditAuthorizationReference;
  readonly orderReference: PaymentOrderReference;
}

export interface CancelAccountCreditInput {
  readonly accountReference: PaymentAccountReference;
  readonly authorizationReference: CreditAuthorizationReference;
}

export interface PrepareAccountCreditPaymentInput {
  readonly accountReference: PaymentAccountReference;
  readonly attemptReference: PaymentAttemptReference;
  readonly checkout: PaymentCheckout;
}

export interface AccountCreditPaymentPreparation {
  readonly provider: PaymentProvider;
  readonly providerReference: PaymentProviderReference;
}

type MemoryCreditProfiles = Map<PaymentAccountReference, CreditProfile>;

const accountCreditProfile = (
  profile: CreditProfile,
  provider: PaymentProvider
): AccountCreditProfile => ({
  ...profile,
  authorizations: profile.authorizations ?? [],
  ledger: profile.ledger ?? [],
  provider,
});

const accountCreditPaymentReferenceFor = (
  input: PrepareAccountCreditPaymentInput
) =>
  PaymentProviderReference.make(
    `credit-${input.accountReference}-${input.attemptReference}`
  );

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

const accountCreditFailure = (operation: string, cause: unknown) =>
  new PaymentProviderFailure({
    cause,
    operation,
    reason: accountCreditFailureReason(cause),
  });

export const creditAuthorizationReferenceFor = (
  input: AuthorizeAccountCreditInput
) =>
  CreditAuthorizationReference.make(
    `credit-${input.accountReference}-${input.operationReference}`
  );

type AuthorizationUpdate =
  | {
      readonly profile: CreditProfile;
      readonly reference: CreditAuthorizationReference;
    }
  | PaymentOperationDeclined;

const authorizeProfile = (
  profile: CreditProfile,
  input: AuthorizeAccountCreditInput
): AuthorizationUpdate => {
  const authorizations = profile.authorizations ?? [];
  const existing = authorizations.find(
    (authorization) =>
      authorization.operationReference === input.operationReference
  );
  if (existing !== undefined) {
    if (
      existing.amount.centAmount !== input.amount.centAmount ||
      existing.amount.currencyCode !== input.amount.currencyCode
    ) {
      return new PaymentOperationDeclined({
        message: "Credit authorization amount changed",
        operation: "authorize",
      });
    }
    return existing.state === "cancelled"
      ? new PaymentOperationDeclined({
          message:
            "Credit authorization was released; save Payment Options again",
          operation: "authorize",
        })
      : { profile, reference: existing.reference };
  }
  if (
    profile.availableCredit.currencyCode !== input.amount.currencyCode ||
    profile.availableCredit.centAmount < input.amount.centAmount
  ) {
    return new PaymentOperationDeclined({
      message: "Available account credit no longer covers the Order total",
      operation: "authorize",
    });
  }

  const reference = creditAuthorizationReferenceFor(input);
  return {
    profile: {
      ...profile,
      authorizations: [
        ...authorizations,
        {
          amount: input.amount,
          operationReference: input.operationReference,
          reference,
          state: "reserved",
        },
      ],
      availableCredit: {
        centAmount:
          profile.availableCredit.centAmount - input.amount.centAmount,
        currencyCode: profile.availableCredit.currencyCode,
      },
    },
    reference,
  };
};

const commitProfile = (
  profile: CreditProfile,
  input: CompleteAccountCreditInput
): CreditProfile | undefined => {
  const authorizations = profile.authorizations ?? [];
  const authorization = authorizations.find(
    (candidate) => candidate.reference === input.authorizationReference
  );
  if (authorization?.state === "committed") {
    return profile;
  }
  if (authorization?.state !== "reserved") {
    return undefined;
  }

  const ledger = profile.ledger ?? [];
  return {
    ...profile,
    authorizations: authorizations.map((candidate) =>
      candidate.reference === input.authorizationReference
        ? { ...candidate, state: "committed" as const }
        : candidate
    ),
    ledger: ledger.some(
      (entry) => entry.reference === input.authorizationReference
    )
      ? ledger
      : [
          ...ledger,
          {
            amount: authorization.amount,
            direction: "debit" as const,
            orderReference: input.orderReference,
            reference: input.authorizationReference,
          },
        ],
  };
};

const cancelProfile = (
  profile: CreditProfile,
  input: CancelAccountCreditInput
): CreditProfile | undefined => {
  const authorizations = profile.authorizations ?? [];
  const authorization = authorizations.find(
    (candidate) => candidate.reference === input.authorizationReference
  );
  if (authorization?.state === "cancelled") {
    return profile;
  }
  if (authorization?.state !== "reserved") {
    return undefined;
  }

  return {
    ...profile,
    authorizations: authorizations.map((candidate) =>
      candidate.reference === input.authorizationReference
        ? { ...candidate, state: "cancelled" as const }
        : candidate
    ),
    availableCredit: {
      centAmount:
        profile.availableCredit.centAmount + authorization.amount.centAmount,
      currencyCode: profile.availableCredit.currencyCode,
    },
  };
};

export class AccountCredit extends Context.Service<
  AccountCredit,
  {
    readonly authorize: (
      input: AuthorizeAccountCreditInput
    ) => Effect.Effect<
      CreditAuthorizationReference,
      PaymentOperationDeclined | PaymentProviderFailure
    >;
    readonly cancel: (
      input: CancelAccountCreditInput
    ) => Effect.Effect<void, PaymentProviderFailure>;
    readonly commit: (
      input: CompleteAccountCreditInput
    ) => Effect.Effect<void, PaymentProviderFailure>;
    readonly find: (
      accountReference: PaymentAccountReference
    ) => Effect.Effect<
      Option.Option<AccountCreditProfile>,
      PaymentProviderFailure
    >;
    readonly preparePayment: (
      input: PrepareAccountCreditPaymentInput
    ) => Effect.Effect<AccountCreditPaymentPreparation, PaymentProviderFailure>;
  }
>()("@repo/payments/AccountCredit") {
  static readonly layerMemory = (
    profiles: ReadonlyMap<PaymentAccountReference, CreditProfile>,
    provider = "MemoryAccountCredit"
  ) =>
    Layer.effect(
      AccountCredit,
      Effect.gen(function* () {
        const records = yield* Ref.make<MemoryCreditProfiles>(
          new Map(profiles)
        );
        const paymentProvider = PaymentProvider.make(provider);

        const update = <Input>(
          input: Input & { readonly accountReference: PaymentAccountReference },
          operation: string,
          change: (
            profile: CreditProfile,
            input: Input
          ) => CreditProfile | undefined
        ) =>
          Ref.modify(records, (current) => {
            const profile = current.get(input.accountReference);
            const next =
              profile === undefined ? undefined : change(profile, input);
            return next === undefined
              ? ([
                  new PaymentProviderFailure({
                    operation,
                    reason: "invalidData",
                  }),
                  current,
                ] as const)
              : ([
                  undefined,
                  new Map(current).set(input.accountReference, next),
                ] as const);
          }).pipe(
            Effect.flatMap((failure) =>
              failure === undefined ? Effect.void : Effect.fail(failure)
            )
          );

        return AccountCredit.of({
          authorize: Effect.fn("AccountCredit.memory.authorize")((input) =>
            Ref.modify(
              records,
              (
                current
              ): readonly [
                CreditAuthorizationReference | PaymentOperationDeclined,
                MemoryCreditProfiles,
              ] => {
                const profile = current.get(input.accountReference);
                if (profile === undefined) {
                  return [
                    new PaymentOperationDeclined({
                      message: "Account is not approved for credit",
                      operation: "authorize",
                    }),
                    current,
                  ] as const;
                }
                const result = authorizeProfile(profile, input);
                return Schema.is(PaymentOperationDeclined)(result)
                  ? ([result, current] as const)
                  : ([
                      result.reference,
                      new Map(current).set(
                        input.accountReference,
                        result.profile
                      ),
                    ] as const);
              }
            ).pipe(
              Effect.flatMap((result) =>
                Schema.is(PaymentOperationDeclined)(result)
                  ? Effect.fail(result)
                  : Effect.succeed(result)
              )
            )
          ),
          cancel: Effect.fn("AccountCredit.memory.cancel")((input) =>
            update(input, "accountCredit.cancel", cancelProfile)
          ),
          commit: Effect.fn("AccountCredit.memory.commit")((input) =>
            update(input, "accountCredit.commit", commitProfile)
          ),
          find: Effect.fn("AccountCredit.memory.find")((accountReference) =>
            Ref.get(records).pipe(
              Effect.map((current) =>
                Option.fromNullishOr(current.get(accountReference)).pipe(
                  Option.map((profile) =>
                    accountCreditProfile(profile, paymentProvider)
                  )
                )
              )
            )
          ),
          preparePayment: Effect.fn("AccountCredit.memory.preparePayment")(
            (input) =>
              Effect.succeed({
                provider: paymentProvider,
                providerReference: accountCreditPaymentReferenceFor(input),
              })
          ),
        });
      })
    );

  static readonly layerVersionedStore = (provider = "ExternalLedger") =>
    Layer.effect(
      AccountCredit,
      Effect.gen(function* () {
        const store = yield* VersionedKeyValueStore;
        const paymentProvider = PaymentProvider.make(provider);

        const updateStored = <Input>(
          input: Input & { readonly accountReference: PaymentAccountReference },
          operation: string,
          change: (
            profile: CreditProfile,
            input: Input
          ) => CreditProfile | undefined,
          remainingRetries = 2
        ): Effect.Effect<void, PaymentProviderFailure> =>
          Schema.decodeEffect(VersionedStoreKey)(input.accountReference).pipe(
            Effect.flatMap((key) =>
              store.get(key, CreditProfile).pipe(
                Effect.flatMap(
                  Option.match({
                    onNone: () =>
                      Effect.fail(
                        new PaymentProviderFailure({
                          operation,
                          reason: "invalidData",
                        })
                      ),
                    onSome: (current) => {
                      const next = change(current.value, input);
                      if (next === undefined) {
                        return Effect.fail(
                          new PaymentProviderFailure({
                            operation,
                            reason: "invalidData",
                          })
                        );
                      }
                      return store
                        .update(key, CreditProfile, current, next)
                        .pipe(
                          Effect.catchTag("StoreConflict", (error) =>
                            remainingRetries > 0
                              ? updateStored(
                                  input,
                                  operation,
                                  change,
                                  remainingRetries - 1
                                )
                              : Effect.fail(
                                  accountCreditFailure(operation, error)
                                )
                          ),
                          Effect.mapError((error) =>
                            Schema.is(PaymentProviderFailure)(error)
                              ? error
                              : accountCreditFailure(operation, error)
                          )
                        );
                    },
                  })
                )
              )
            ),
            Effect.mapError((error) =>
              Schema.is(PaymentProviderFailure)(error)
                ? error
                : accountCreditFailure(operation, error)
            )
          );

        const authorizeStored = (
          input: AuthorizeAccountCreditInput,
          remainingRetries = 2
        ): Effect.Effect<
          CreditAuthorizationReference,
          PaymentOperationDeclined | PaymentProviderFailure
        > =>
          Schema.decodeEffect(VersionedStoreKey)(input.accountReference).pipe(
            Effect.flatMap((key) =>
              store.get(key, CreditProfile).pipe(
                Effect.flatMap(
                  Option.match({
                    onNone: () =>
                      Effect.fail(
                        new PaymentOperationDeclined({
                          message: "Account is not approved for credit",
                          operation: "authorize",
                        })
                      ),
                    onSome: (current) => {
                      const result = authorizeProfile(current.value, input);
                      if (Schema.is(PaymentOperationDeclined)(result)) {
                        return Effect.fail(result);
                      }
                      return store
                        .update(key, CreditProfile, current, result.profile)
                        .pipe(
                          Effect.as(result.reference),
                          Effect.catchTag("StoreConflict", (error) =>
                            remainingRetries > 0
                              ? authorizeStored(input, remainingRetries - 1)
                              : Effect.fail(
                                  accountCreditFailure(
                                    "accountCredit.authorize",
                                    error
                                  )
                                )
                          )
                        );
                    },
                  })
                )
              )
            ),
            Effect.mapError((error) =>
              Schema.is(PaymentOperationDeclined)(error) ||
              Schema.is(PaymentProviderFailure)(error)
                ? error
                : accountCreditFailure("accountCredit.authorize", error)
            )
          );

        return AccountCredit.of({
          authorize: Effect.fn("AccountCredit.versionedStore.authorize")(
            authorizeStored
          ),
          cancel: Effect.fn("AccountCredit.versionedStore.cancel")((input) =>
            updateStored(input, "accountCredit.cancel", cancelProfile)
          ),
          commit: Effect.fn("AccountCredit.versionedStore.commit")((input) =>
            updateStored(input, "accountCredit.commit", commitProfile)
          ),
          find: Effect.fn("AccountCredit.versionedStore.find")(
            (accountReference) =>
              Schema.decodeEffect(VersionedStoreKey)(accountReference).pipe(
                Effect.flatMap((key) => store.get(key, CreditProfile)),
                Effect.map(
                  Option.map(({ value }) =>
                    accountCreditProfile(value, paymentProvider)
                  )
                ),
                Effect.mapError((error) =>
                  accountCreditFailure("accountCredit.find", error)
                )
              )
          ),
          preparePayment: Effect.fn(
            "AccountCredit.versionedStore.preparePayment"
          )((input) =>
            Effect.succeed({
              provider: paymentProvider,
              providerReference: accountCreditPaymentReferenceFor(input),
            })
          ),
        });
      })
    );
}
