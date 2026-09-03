import { Context, Effect, Layer, Option, Schema } from "effect";

import {
  PaymentOperationDeclined,
  PaymentPreparationUnavailable,
  PaymentProviderFailure,
  PaymentProviderTransactionReference,
  paymentOperationReferencesForAttempt,
} from "../domain";
import type {
  CardPaymentMethodSummary,
  CheckoutPaymentBuyer,
  PaymentAttemptReference,
  PaymentAccountReference,
  PaymentAuthorization,
  PaymentBillingAddress,
  PaymentCheckout,
  PaymentMethodUnavailable,
  PaymentFinalizationStatus,
  PaymentMethodSummary,
  PaymentOperationReference,
  PaymentOptions,
  PaymentOrderReference,
  PaymentReference,
  PaymentSelection,
  PaymentTransactionState,
  PaymentTransactionType,
  PreparedPayment,
} from "../domain";
import {
  AccountCredit,
  creditAuthorizationReferenceFor,
} from "./account-credit";
import type { CreditProfile } from "./account-credit";
import { CardPaymentMethod } from "./card-payment-method";
import { CardPayments } from "./card-payments";
import type { CardPaymentsMemorySeed } from "./card-payments";
import { NetTermsPaymentMethod } from "./net-terms-payment-method";
import { PaymentRepository } from "./payment-repository";
import type {
  PaymentRepositoryMemorySeed,
  PaymentRecord,
} from "./payment-repository";

export interface PrepareCheckoutPaymentsInput {
  readonly buyer: CheckoutPaymentBuyer;
  readonly checkout: PaymentCheckout;
}

export interface SaveCheckoutPaymentInput extends PrepareCheckoutPaymentsInput {
  readonly attemptReference: PaymentAttemptReference;
  readonly billingAddress: PaymentBillingAddress;
  readonly selection: PaymentSelection;
}

export interface CheckoutPaymentOperationInput {
  readonly buyer: CheckoutPaymentBuyer;
  readonly checkout: PaymentCheckout;
  readonly paymentReference: PaymentReference;
}

export interface AuthorizeCheckoutPaymentInput extends CheckoutPaymentOperationInput {
  readonly payment: PreparedPayment;
}

export interface FinalizeCheckoutPaymentInput extends CheckoutPaymentOperationInput {
  readonly orderReference: PaymentOrderReference;
}

export type PrepareCheckoutPaymentsFailure = PaymentProviderFailure;

export type SaveCheckoutPaymentFailure =
  | PaymentMethodUnavailable
  | PaymentPreparationUnavailable
  | PaymentProviderFailure;

export type CheckoutPaymentOperationFailure =
  | PaymentOperationDeclined
  | PaymentPreparationUnavailable
  | PaymentProviderFailure;

export interface CheckoutPaymentsMemorySeed {
  readonly card: CardPaymentsMemorySeed;
  readonly cardPaymentReferenceFor: PaymentRepositoryMemorySeed["cardPaymentReferenceFor"];
  readonly creditProfiles: readonly (CreditProfile & {
    readonly accountReference: PaymentAccountReference;
  })[];
  readonly netTermsPaymentReferenceFor: PaymentRepositoryMemorySeed["netTermsPaymentReferenceFor"];
}

const paymentMethodsLayer = Layer.merge(
  CardPaymentMethod.layer,
  NetTermsPaymentMethod.layer
);

const operationReferencesFor = (
  payment: PaymentRecord,
  expectedAttempt?: PaymentAttemptReference
): Effect.Effect<
  ReturnType<typeof paymentOperationReferencesForAttempt>,
  PaymentProviderFailure
> =>
  payment.attemptReference === undefined ||
  (expectedAttempt !== undefined &&
    payment.attemptReference !== expectedAttempt)
    ? Effect.fail(
        new PaymentProviderFailure({
          operation: "paymentRepository.findAttempt",
          reason: "invalidData",
        })
      )
    : Effect.succeed(
        paymentOperationReferencesForAttempt(payment.attemptReference)
      );

export class CheckoutPayments extends Context.Service<
  CheckoutPayments,
  {
    readonly authorize: (
      input: AuthorizeCheckoutPaymentInput
    ) => Effect.Effect<PaymentAuthorization, CheckoutPaymentOperationFailure>;
    readonly cancelAuthorization: (
      input: CheckoutPaymentOperationInput
    ) => Effect.Effect<void, PaymentProviderFailure>;
    readonly finalize: (
      input: FinalizeCheckoutPaymentInput
    ) => Effect.Effect<void, PaymentOperationDeclined | PaymentProviderFailure>;
    readonly getFinalizationStatus: (
      paymentReference: PaymentReference
    ) => Effect.Effect<PaymentFinalizationStatus, PaymentProviderFailure>;
    readonly getPaymentMethod: (
      paymentReference: PaymentReference
    ) => Effect.Effect<PaymentMethodSummary, PaymentProviderFailure>;
    readonly prepare: (
      input: PrepareCheckoutPaymentsInput
    ) => Effect.Effect<PaymentOptions, PrepareCheckoutPaymentsFailure>;
    readonly save: (
      input: SaveCheckoutPaymentInput
    ) => Effect.Effect<PreparedPayment, SaveCheckoutPaymentFailure>;
  }
>()("@repo/payments/CheckoutPayments") {
  static readonly unavailableLayer = Layer.succeed(
    CheckoutPayments,
    CheckoutPayments.of({
      authorize: () =>
        Effect.die(
          new Error("Checkout Payments are unavailable in this runtime")
        ),
      cancelAuthorization: () =>
        Effect.die(
          new Error("Checkout Payments are unavailable in this runtime")
        ),
      finalize: () =>
        Effect.die(
          new Error("Checkout Payments are unavailable in this runtime")
        ),
      getFinalizationStatus: () =>
        Effect.die(
          new Error("Checkout Payments are unavailable in this runtime")
        ),
      getPaymentMethod: () =>
        Effect.die(
          new Error("Checkout Payments are unavailable in this runtime")
        ),
      prepare: () =>
        Effect.die(
          new Error("Checkout Payments are unavailable in this runtime")
        ),
      save: () =>
        Effect.die(
          new Error("Checkout Payments are unavailable in this runtime")
        ),
    })
  );

  static readonly authorize = Effect.fn("CheckoutPayments.authorize")(
    (input: AuthorizeCheckoutPaymentInput) =>
      CheckoutPayments.pipe(
        Effect.flatMap((payments) => payments.authorize(input))
      )
  );

  static readonly cancelAuthorization = Effect.fn(
    "CheckoutPayments.cancelAuthorization"
  )((input: CheckoutPaymentOperationInput) =>
    CheckoutPayments.pipe(
      Effect.flatMap((payments) => payments.cancelAuthorization(input))
    )
  );

  static readonly finalize = Effect.fn("CheckoutPayments.finalize")(
    (input: FinalizeCheckoutPaymentInput) =>
      CheckoutPayments.pipe(
        Effect.flatMap((payments) => payments.finalize(input))
      )
  );

  static readonly getFinalizationStatus = Effect.fn(
    "CheckoutPayments.getFinalizationStatus"
  )((paymentReference: PaymentReference) =>
    CheckoutPayments.pipe(
      Effect.flatMap((payments) =>
        payments.getFinalizationStatus(paymentReference)
      )
    )
  );

  static readonly getPaymentMethod = Effect.fn(
    "CheckoutPayments.getPaymentMethod"
  )((paymentReference: PaymentReference) =>
    CheckoutPayments.pipe(
      Effect.flatMap((payments) => payments.getPaymentMethod(paymentReference))
    )
  );

  static readonly prepare = Effect.fn("CheckoutPayments.prepare")(
    (input: PrepareCheckoutPaymentsInput) =>
      CheckoutPayments.pipe(
        Effect.flatMap((payments) => payments.prepare(input))
      )
  );

  static readonly save = Effect.fn("CheckoutPayments.save")(
    (input: SaveCheckoutPaymentInput) =>
      CheckoutPayments.pipe(Effect.flatMap((payments) => payments.save(input)))
  );

  static readonly layer = Layer.effect(
    CheckoutPayments,
    Effect.gen(function* () {
      const card = yield* CardPaymentMethod;
      const netTerms = yield* NetTermsPaymentMethod;
      const cards = yield* CardPayments;
      const accountCredit = yield* AccountCredit;
      const repository = yield* PaymentRepository;

      const transaction = (
        input: CheckoutPaymentOperationInput,
        payment: PaymentRecord,
        operationReference: PaymentOperationReference,
        type: PaymentTransactionType,
        state: PaymentTransactionState,
        providerReference?: PaymentProviderTransactionReference,
        paymentMethod?: CardPaymentMethodSummary
      ) => {
        const transactionWithoutProvider = {
          amount: input.checkout.amount,
          operationReference,
          paymentReference: payment.paymentReference,
          state,
          type,
        };
        const transactionWithMethod =
          paymentMethod === undefined
            ? transactionWithoutProvider
            : { ...transactionWithoutProvider, paymentMethod };
        return repository.recordTransaction(
          providerReference === undefined
            ? transactionWithMethod
            : { ...transactionWithMethod, providerReference }
        );
      };

      const completedTransaction = Effect.fn(
        "CheckoutPayments.completedTransaction"
      )(
        (
          input: CheckoutPaymentOperationInput,
          payment: PaymentRecord,
          operationReference: PaymentOperationReference,
          type: PaymentTransactionType
        ) =>
          repository.findTransactions(payment.paymentReference).pipe(
            Effect.flatMap((transactions) => {
              const candidates = transactions.filter(
                (candidate) =>
                  candidate.operationReference === operationReference
              );
              if (
                candidates.some(
                  (candidate) =>
                    candidate.type !== type ||
                    candidate.amount.centAmount !==
                      input.checkout.amount.centAmount ||
                    candidate.amount.currencyCode !==
                      input.checkout.amount.currencyCode
                )
              ) {
                return Effect.fail(
                  new PaymentProviderFailure({
                    operation: "paymentRepository.findTransactions",
                    reason: "invalidData",
                  })
                );
              }
              return Effect.succeed(
                candidates.some((candidate) => candidate.state === "Success")
              );
            })
          )
      );

      const paymentMethodFor = Effect.fn("CheckoutPayments.paymentMethodFor")((
        payment: PaymentRecord
      ): Effect.Effect<PaymentMethodSummary, PaymentProviderFailure> => {
        if (payment.method === "netTerms") {
          return Effect.succeed({
            method: "netTerms" as const,
            termsInDays: payment.termsInDays,
          });
        }
        return payment.paymentMethod === undefined
          ? Effect.fail(
              new PaymentProviderFailure({
                operation: "paymentRepository.findPaymentMethod",
                reason: "invalidData",
              })
            )
          : Effect.succeed(payment.paymentMethod);
      });

      const authorizationWasReleased = Effect.fn(
        "CheckoutPayments.authorizationWasReleased"
      )((payment: PaymentRecord, cancelReference: PaymentOperationReference) =>
        repository
          .findTransactions(payment.paymentReference)
          .pipe(
            Effect.map((transactions) =>
              transactions.some(
                (candidate) =>
                  candidate.operationReference === cancelReference &&
                  candidate.type === "CancelAuthorization" &&
                  candidate.state === "Success"
              )
            )
          )
      );

      const recordFailure = <
        E extends PaymentOperationDeclined | PaymentProviderFailure,
      >(
        input: CheckoutPaymentOperationInput,
        payment: PaymentRecord,
        operationReference: PaymentOperationReference,
        type: PaymentTransactionType,
        error: E,
        providerReference?: PaymentProviderTransactionReference
      ) =>
        Schema.is(PaymentProviderFailure)(error) &&
        (error.reason === "unavailable" || error.reason === "outcomeUnknown")
          ? Effect.fail(error)
          : transaction(
              input,
              payment,
              operationReference,
              type,
              "Failure",
              providerReference
            ).pipe(Effect.andThen(Effect.fail(error)));

      const cardRecordFor = Effect.fn("CheckoutPayments.cardRecordFor")(
        (
          input: CheckoutPaymentOperationInput,
          expectedPaymentReference?: PreparedPayment["paymentReference"]
        ) =>
          repository.findCard(input.checkout.reference).pipe(
            Effect.flatMap(
              Option.match({
                onNone: () =>
                  Effect.fail(
                    new PaymentProviderFailure({
                      operation: "paymentRepository.findCard",
                      reason: "invalidData",
                    })
                  ),
                onSome: (record) =>
                  (expectedPaymentReference === undefined ||
                    record.paymentReference === expectedPaymentReference) &&
                  record.provider === cards.provider
                    ? Effect.succeed(record)
                    : Effect.fail(
                        new PaymentProviderFailure({
                          operation: "paymentRepository.findCard",
                          reason: "invalidData",
                        })
                      ),
              })
            )
          )
      );

      const paymentRecordFor = Effect.fn("CheckoutPayments.paymentRecordFor")(
        (input: CheckoutPaymentOperationInput) =>
          repository.findByReference(input.paymentReference).pipe(
            Effect.flatMap(
              Option.match({
                onNone: () =>
                  Effect.fail(
                    new PaymentProviderFailure({
                      operation: "paymentRepository.findByReference",
                      reason: "invalidData",
                    })
                  ),
                onSome: Effect.succeed,
              })
            )
          )
      );

      const prepare = Effect.fn("CheckoutPayments.live.prepare")(
        (input: PrepareCheckoutPaymentsInput) =>
          Effect.gen(function* () {
            const [cardPreparation, netTermsEligibility] = yield* Effect.all([
              Effect.result(card.prepare(input.checkout)),
              Effect.result(netTerms.eligibility(input)),
            ]);
            if (
              cardPreparation._tag === "Failure" &&
              cardPreparation.failure.reason !== "unavailable"
            ) {
              return yield* cardPreparation.failure;
            }
            if (
              netTermsEligibility._tag === "Failure" &&
              netTermsEligibility.failure.reason !== "unavailable"
            ) {
              return yield* netTermsEligibility.failure;
            }

            const methods: PaymentOptions["methods"][number][] = [];
            if (cardPreparation._tag === "Success") {
              methods.push(cardPreparation.success);
            }
            if (
              netTermsEligibility._tag === "Success" &&
              netTermsEligibility.success._tag === "Eligible"
            ) {
              methods.push(netTermsEligibility.success.option);
            }

            if (
              !methods.some((method) => method.availability === "available")
            ) {
              if (cardPreparation._tag === "Failure") {
                return yield* cardPreparation.failure;
              }
              if (netTermsEligibility._tag === "Failure") {
                return yield* netTermsEligibility.failure;
              }
              return yield* Effect.die(
                new Error(
                  "Payment Options produced no available Payment Method"
                )
              );
            }

            if (cardPreparation._tag === "Failure") {
              yield* Effect.logWarning(
                "Card is temporarily unavailable; retaining other Payment Methods",
                cardPreparation.failure
              );
            }
            if (netTermsEligibility._tag === "Failure") {
              yield* Effect.logWarning(
                "Net Terms is temporarily unavailable; retaining other Payment Methods",
                netTermsEligibility.failure
              );
            }

            return { amount: input.checkout.amount, methods };
          })
      );

      const save = Effect.fn("CheckoutPayments.live.save")(
        (
          input: SaveCheckoutPaymentInput
        ): Effect.Effect<PreparedPayment, SaveCheckoutPaymentFailure> =>
          input.selection.method === "card"
            ? card.save({
                attemptReference: input.attemptReference,
                billingAddress: input.billingAddress,
                checkout: input.checkout,
                selection: input.selection,
              })
            : netTerms.save({
                attemptReference: input.attemptReference,
                billingAddress: input.billingAddress,
                buyer: input.buyer,
                checkout: input.checkout,
              })
      );

      const authorize = Effect.fn("CheckoutPayments.live.authorize")(
        (input: AuthorizeCheckoutPaymentInput) =>
          Effect.gen(function* () {
            if (input.payment.method === "card") {
              const record = yield* cardRecordFor(
                input,
                input.payment.paymentReference
              );
              const confirmationReference =
                record.confirmationReference ??
                (yield* new PaymentPreparationUnavailable({
                  checkoutReference: input.checkout.reference,
                  preparationReference: input.payment.preparationReference,
                  reason: "confirmationUnavailable",
                }));
              const references = yield* operationReferencesFor(
                record,
                input.payment.attemptReference
              );
              if (yield* authorizationWasReleased(record, references.cancel)) {
                return yield* new PaymentPreparationUnavailable({
                  checkoutReference: input.checkout.reference,
                  preparationReference: input.payment.preparationReference,
                  reason: "authorizationReleased",
                });
              }
              if (
                yield* completedTransaction(
                  input,
                  record,
                  references.authorization,
                  "Authorization"
                )
              ) {
                return {
                  _tag: "Authorized" as const,
                  paymentMethod: yield* paymentMethodFor(record),
                };
              }
              yield* transaction(
                input,
                record,
                references.authorization,
                "Authorization",
                "Pending"
              );
              const authorization = yield* cards
                .authorize({
                  checkout: input.checkout,
                  confirmationReference,
                  operationReference: references.authorization,
                  providerReference: record.providerReference,
                })
                .pipe(
                  Effect.catch((error) =>
                    recordFailure(
                      input,
                      record,
                      references.authorization,
                      "Authorization",
                      error
                    )
                  )
                );
              if (authorization._tag === "Authorized") {
                yield* transaction(
                  input,
                  record,
                  references.authorization,
                  "Authorization",
                  "Success",
                  authorization.providerTransactionReference,
                  authorization.paymentMethod.method === "card"
                    ? authorization.paymentMethod
                    : undefined
                );
              }
              return authorization;
            }

            if (input.buyer.type !== "company") {
              return yield* new PaymentOperationDeclined({
                message: "Net Terms require a Company account",
                operation: "authorize",
              });
            }
            const record = yield* paymentRecordFor(input);
            if (
              record.method !== "netTerms" ||
              record.paymentReference !== input.payment.paymentReference
            ) {
              return yield* new PaymentProviderFailure({
                operation: "paymentRepository.find",
                reason: "invalidData",
              });
            }
            const references = yield* operationReferencesFor(
              record,
              input.payment.attemptReference
            );
            if (yield* authorizationWasReleased(record, references.cancel)) {
              return yield* new PaymentOperationDeclined({
                message:
                  "Credit authorization was released; save Payment Options again",
                operation: "authorize",
              });
            }
            const paymentMethod = yield* paymentMethodFor(record);
            if (
              yield* completedTransaction(
                input,
                record,
                references.authorization,
                "Authorization"
              )
            ) {
              return { _tag: "Authorized" as const, paymentMethod };
            }
            yield* transaction(
              input,
              record,
              references.authorization,
              "Authorization",
              "Pending"
            );
            const authorizationReference = yield* accountCredit
              .authorize({
                accountReference: input.buyer.accountReference,
                amount: input.checkout.amount,
                operationReference: references.authorization,
              })
              .pipe(
                Effect.catch((error) =>
                  recordFailure(
                    input,
                    record,
                    references.authorization,
                    "Authorization",
                    error
                  )
                )
              );
            const providerTransactionReference =
              PaymentProviderTransactionReference.make(authorizationReference);
            yield* transaction(
              input,
              record,
              references.authorization,
              "Authorization",
              "Success",
              providerTransactionReference
            );
            return {
              _tag: "Authorized" as const,
              paymentMethod,
              providerTransactionReference,
            };
          })
      );

      const cancelAuthorization = Effect.fn(
        "CheckoutPayments.live.cancelAuthorization"
      )((input: CheckoutPaymentOperationInput) =>
        Effect.gen(function* () {
          const payment = yield* paymentRecordFor(input);
          const references = yield* operationReferencesFor(payment);
          if (
            yield* completedTransaction(
              input,
              payment,
              references.cancel,
              "CancelAuthorization"
            )
          ) {
            return;
          }
          if (payment.method === "card") {
            const record = payment;
            yield* transaction(
              input,
              record,
              references.cancel,
              "CancelAuthorization",
              "Pending"
            );
            const cancellation = yield* cards
              .cancelAuthorization({
                checkout: input.checkout,
                operationReference: references.cancel,
                providerReference: record.providerReference,
              })
              .pipe(
                Effect.catch((error) =>
                  recordFailure(
                    input,
                    record,
                    references.cancel,
                    "CancelAuthorization",
                    error
                  )
                )
              );
            yield* transaction(
              input,
              record,
              references.cancel,
              "CancelAuthorization",
              "Success",
              cancellation.providerTransactionReference
            );
            return;
          }
          if (input.buyer.type !== "company") {
            return yield* new PaymentProviderFailure({
              operation: "accountCredit.cancel",
              reason: "invalidData",
            });
          }
          yield* transaction(
            input,
            payment,
            references.cancel,
            "CancelAuthorization",
            "Pending"
          );
          yield* accountCredit
            .cancel({
              accountReference: input.buyer.accountReference,
              authorizationReference: creditAuthorizationReferenceFor({
                accountReference: input.buyer.accountReference,
                amount: input.checkout.amount,
                operationReference: references.authorization,
              }),
            })
            .pipe(
              Effect.catch((error) =>
                recordFailure(
                  input,
                  payment,
                  references.cancel,
                  "CancelAuthorization",
                  error
                )
              )
            );
          yield* transaction(
            input,
            payment,
            references.cancel,
            "CancelAuthorization",
            "Success"
          );
        })
      );

      const finalize = Effect.fn("CheckoutPayments.live.finalize")(
        (input: FinalizeCheckoutPaymentInput) =>
          Effect.gen(function* () {
            const payment = yield* paymentRecordFor(input);
            const references = yield* operationReferencesFor(payment);
            if (payment.method === "card") {
              if (
                yield* completedTransaction(
                  input,
                  payment,
                  references.finalize,
                  "Charge"
                )
              ) {
                return;
              }
              const record = payment;
              yield* transaction(
                input,
                record,
                references.finalize,
                "Charge",
                "Pending"
              );
              const capture = yield* cards
                .capture({
                  checkout: input.checkout,
                  operationReference: references.finalize,
                  providerReference: record.providerReference,
                })
                .pipe(
                  Effect.catch((error) =>
                    recordFailure(
                      input,
                      record,
                      references.finalize,
                      "Charge",
                      error
                    )
                  )
                );
              yield* transaction(
                input,
                record,
                references.finalize,
                "Charge",
                "Success",
                capture.providerTransactionReference
              );
              return;
            }
            if (input.buyer.type !== "company") {
              return yield* new PaymentProviderFailure({
                operation: "accountCredit.commit",
                reason: "invalidData",
              });
            }
            if (
              yield* completedTransaction(
                input,
                payment,
                references.finalize,
                "Charge"
              )
            ) {
              return;
            }
            yield* transaction(
              input,
              payment,
              references.finalize,
              "Charge",
              "Pending"
            );
            yield* accountCredit
              .commit({
                accountReference: input.buyer.accountReference,
                authorizationReference: creditAuthorizationReferenceFor({
                  accountReference: input.buyer.accountReference,
                  amount: input.checkout.amount,
                  operationReference: references.authorization,
                }),
                orderReference: input.orderReference,
              })
              .pipe(
                Effect.catch((error) =>
                  recordFailure(
                    input,
                    payment,
                    references.finalize,
                    "Charge",
                    error
                  )
                )
              );
            yield* transaction(
              input,
              payment,
              references.finalize,
              "Charge",
              "Success"
            );
          })
      );

      const getFinalizationStatus = Effect.fn(
        "CheckoutPayments.live.getFinalizationStatus"
      )((paymentReference: PaymentReference) =>
        repository
          .findTransactions(paymentReference)
          .pipe(
            Effect.map((transactions) =>
              transactions.some(
                (candidate) =>
                  candidate.type === "Charge" && candidate.state === "Success"
              )
                ? ("confirmed" as const)
                : ("pending" as const)
            )
          )
      );

      const getPaymentMethod = Effect.fn(
        "CheckoutPayments.live.getPaymentMethod"
      )((paymentReference: PaymentReference) =>
        repository.findByReference(paymentReference).pipe(
          Effect.flatMap(
            Option.match({
              onNone: () =>
                Effect.fail(
                  new PaymentProviderFailure({
                    operation: "paymentRepository.findByReference",
                    reason: "invalidData",
                  })
                ),
              onSome: paymentMethodFor,
            })
          )
        )
      );

      return CheckoutPayments.of({
        authorize,
        cancelAuthorization,
        finalize,
        getFinalizationStatus,
        getPaymentMethod,
        prepare,
        save,
      });
    })
  ).pipe(Layer.provide(paymentMethodsLayer));

  static readonly layerMemory = (seed: CheckoutPaymentsMemorySeed) => {
    const profiles = new Map(
      seed.creditProfiles.map(({ accountReference, ...profile }) => [
        accountReference,
        profile,
      ])
    );
    return CheckoutPayments.layer.pipe(
      Layer.provide(
        Layer.mergeAll(
          AccountCredit.layerMemory(profiles),
          CardPayments.layerMemory(seed.card),
          PaymentRepository.layerMemory({
            cardPaymentReferenceFor: seed.cardPaymentReferenceFor,
            netTermsPaymentReferenceFor: seed.netTermsPaymentReferenceFor,
          })
        )
      )
    );
  };
}
