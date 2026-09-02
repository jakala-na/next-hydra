import { Context, Effect, Layer, Option, Ref } from "effect";

import type {
  CardPaymentMethodSummary,
  PaymentAttemptReference,
  PaymentConfirmationReference,
  PaymentCheckout,
  PaymentCheckoutReference,
  PaymentOperationReference,
  PaymentTransaction,
  PaymentTransactionState,
  PaymentTransactionType,
  PaymentProviderFailure,
  PaymentProvider,
  PaymentProviderReference,
  PaymentProviderTransactionReference,
  PaymentReference,
} from "../domain";

export interface CardPaymentRecord {
  readonly attemptReference?: PaymentAttemptReference;
  readonly confirmationReference?: PaymentConfirmationReference;
  readonly method: "card";
  readonly paymentMethod?: CardPaymentMethodSummary;
  readonly paymentReference: PaymentReference;
  readonly provider: PaymentProvider;
  readonly providerReference: PaymentProviderReference;
}

export interface NetTermsPaymentRecord {
  readonly attemptReference?: PaymentAttemptReference;
  readonly method: "netTerms";
  readonly paymentReference: PaymentReference;
  readonly provider: PaymentProvider;
  readonly providerReference: PaymentProviderReference;
  readonly termsInDays: number;
}

export type PaymentRecord = CardPaymentRecord | NetTermsPaymentRecord;

export interface SaveCardPaymentRecordInput {
  readonly attemptReference?: PaymentAttemptReference;
  readonly checkout: PaymentCheckout;
  readonly confirmationReference?: PaymentConfirmationReference;
  readonly provider: PaymentProvider;
  readonly providerReference: PaymentProviderReference;
}

export interface SaveNetTermsPaymentRecordInput {
  readonly attemptReference: PaymentAttemptReference;
  readonly checkout: PaymentCheckout;
  readonly provider: PaymentProvider;
  readonly providerReference: PaymentProviderReference;
  readonly termsInDays: number;
}

export interface RecordPaymentTransactionInput {
  readonly amount: PaymentCheckout["amount"];
  readonly operationReference: PaymentOperationReference;
  readonly paymentReference: PaymentReference;
  readonly paymentMethod?: CardPaymentMethodSummary;
  readonly providerReference?: PaymentProviderTransactionReference;
  readonly state: PaymentTransactionState;
  readonly type: PaymentTransactionType;
}

export interface PaymentRepositoryMemorySeed {
  readonly cardPaymentReferenceFor: (
    input: SaveCardPaymentRecordInput
  ) => PaymentReference;
  readonly netTermsPaymentReferenceFor: (
    input: SaveNetTermsPaymentRecordInput
  ) => PaymentReference;
}

export class PaymentRepository extends Context.Service<
  PaymentRepository,
  {
    readonly findCard: (
      checkoutReference: PaymentCheckoutReference
    ) => Effect.Effect<
      Option.Option<CardPaymentRecord>,
      PaymentProviderFailure
    >;
    readonly findByReference: (
      paymentReference: PaymentReference
    ) => Effect.Effect<Option.Option<PaymentRecord>, PaymentProviderFailure>;
    readonly findTransactions: (
      paymentReference: PaymentReference
    ) => Effect.Effect<readonly PaymentTransaction[], PaymentProviderFailure>;
    readonly recordTransaction: (
      input: RecordPaymentTransactionInput
    ) => Effect.Effect<void, PaymentProviderFailure>;
    readonly saveCard: (
      input: SaveCardPaymentRecordInput
    ) => Effect.Effect<PaymentReference, PaymentProviderFailure>;
    readonly saveNetTerms: (
      input: SaveNetTermsPaymentRecordInput
    ) => Effect.Effect<PaymentReference, PaymentProviderFailure>;
  }
>()("@repo/payments/PaymentRepository") {
  static readonly layerMemory = (seed: PaymentRepositoryMemorySeed) =>
    Layer.effect(
      PaymentRepository,
      Effect.gen(function* () {
        const cards = yield* Ref.make(
          new Map<PaymentCheckoutReference, CardPaymentRecord>()
        );
        const transactions = yield* Ref.make(
          new Map<PaymentReference, readonly PaymentTransaction[]>()
        );
        const netTerms = yield* Ref.make(
          new Map<PaymentCheckoutReference, NetTermsPaymentRecord>()
        );

        return PaymentRepository.of({
          findByReference: Effect.fn(
            "PaymentRepository.memory.findByReference"
          )((paymentReference) =>
            Effect.all([Ref.get(cards), Ref.get(netTerms)]).pipe(
              Effect.map(([cardRecords, netTermsRecords]) =>
                Option.fromNullishOr(
                  [...cardRecords.values(), ...netTermsRecords.values()].find(
                    (record) => record.paymentReference === paymentReference
                  )
                )
              )
            )
          ),
          findCard: Effect.fn("PaymentRepository.memory.findCard")(
            (reference) =>
              Ref.get(cards).pipe(
                Effect.map((records) =>
                  Option.fromNullishOr(records.get(reference))
                )
              )
          ),
          findTransactions: Effect.fn(
            "PaymentRepository.memory.findTransactions"
          )((paymentReference) =>
            Ref.get(transactions).pipe(
              Effect.map((records) => records.get(paymentReference) ?? [])
            )
          ),
          recordTransaction: Effect.fn(
            "PaymentRepository.memory.recordTransaction"
          )((input) =>
            Effect.gen(function* () {
              yield* Ref.update(transactions, (records) => {
                const existing = records.get(input.paymentReference) ?? [];
                const transaction: PaymentTransaction =
                  input.providerReference === undefined
                    ? {
                        amount: input.amount,
                        operationReference: input.operationReference,
                        state: input.state,
                        type: input.type,
                      }
                    : {
                        amount: input.amount,
                        operationReference: input.operationReference,
                        providerReference: input.providerReference,
                        state: input.state,
                        type: input.type,
                      };
                const index = existing.findIndex(
                  (candidate) =>
                    candidate.operationReference === input.operationReference
                );
                const updated =
                  index === -1
                    ? [...existing, transaction]
                    : existing.map((candidate, candidateIndex) =>
                        candidateIndex === index ? transaction : candidate
                      );
                return new Map(records).set(input.paymentReference, updated);
              });
              const { paymentMethod } = input;
              if (paymentMethod !== undefined) {
                yield* Ref.update(cards, (records) => {
                  const entry = [...records.entries()].find(
                    ([, record]) =>
                      record.paymentReference === input.paymentReference
                  );
                  return entry === undefined
                    ? records
                    : new Map(records).set(entry[0], {
                        ...entry[1],
                        paymentMethod,
                      });
                });
              }
            })
          ),
          saveCard: Effect.fn("PaymentRepository.memory.saveCard")((input) =>
            Effect.gen(function* () {
              const current = (yield* Ref.get(cards)).get(
                input.checkout.reference
              );
              const paymentReference =
                current?.paymentReference ??
                seed.cardPaymentReferenceFor(input);
              const confirmationReference =
                input.confirmationReference ?? current?.confirmationReference;
              const attemptReference =
                input.attemptReference ?? current?.attemptReference;
              const recordWithoutConfirmation: CardPaymentRecord =
                attemptReference === undefined
                  ? {
                      method: "card",
                      paymentReference,
                      provider: input.provider,
                      providerReference: input.providerReference,
                    }
                  : {
                      attemptReference,
                      method: "card",
                      paymentReference,
                      provider: input.provider,
                      providerReference: input.providerReference,
                    };
              const recordWithPaymentMethod =
                current?.paymentMethod === undefined
                  ? recordWithoutConfirmation
                  : {
                      ...recordWithoutConfirmation,
                      paymentMethod: current.paymentMethod,
                    };
              const record: CardPaymentRecord =
                confirmationReference === undefined
                  ? recordWithPaymentMethod
                  : {
                      ...recordWithPaymentMethod,
                      confirmationReference,
                    };
              yield* Ref.update(cards, (records) =>
                new Map(records).set(input.checkout.reference, record)
              );
              return paymentReference;
            })
          ),
          saveNetTerms: Effect.fn("PaymentRepository.memory.saveNetTerms")(
            (input) =>
              Effect.gen(function* () {
                const current = (yield* Ref.get(netTerms)).get(
                  input.checkout.reference
                );
                const paymentReference =
                  current?.paymentReference ??
                  seed.netTermsPaymentReferenceFor(input);
                yield* Ref.update(netTerms, (records) =>
                  new Map(records).set(input.checkout.reference, {
                    attemptReference: input.attemptReference,
                    method: "netTerms",
                    paymentReference,
                    provider: input.provider,
                    providerReference: input.providerReference,
                    termsInDays: input.termsInDays,
                  })
                );
                return paymentReference;
              })
          ),
        });
      })
    );
}
