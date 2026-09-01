import { Context, Effect, Layer, Option, Ref } from "effect";

import type {
  PaymentConfirmationReference,
  PaymentCheckout,
  PaymentCheckoutReference,
  PaymentProviderFailure,
  PaymentProvider,
  PaymentProviderReference,
  PaymentReference,
} from "../domain";

export interface CardPaymentRecord {
  readonly confirmationReference?: PaymentConfirmationReference;
  readonly paymentReference: PaymentReference;
  readonly provider: PaymentProvider;
  readonly providerReference: PaymentProviderReference;
}

export interface SaveCardPaymentRecordInput {
  readonly checkout: PaymentCheckout;
  readonly confirmationReference?: PaymentConfirmationReference;
  readonly provider: PaymentProvider;
  readonly providerReference: PaymentProviderReference;
}

export interface SaveNetTermsPaymentRecordInput {
  readonly checkout: PaymentCheckout;
  readonly provider: PaymentProvider;
  readonly termsInDays: number;
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

        return PaymentRepository.of({
          findCard: Effect.fn("PaymentRepository.memory.findCard")(
            (reference) =>
              Ref.get(cards).pipe(
                Effect.map((records) =>
                  Option.fromNullishOr(records.get(reference))
                )
              )
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
              yield* Ref.update(cards, (records) =>
                new Map(records).set(
                  input.checkout.reference,
                  confirmationReference === undefined
                    ? {
                        paymentReference,
                        provider: input.provider,
                        providerReference: input.providerReference,
                      }
                    : {
                        confirmationReference,
                        paymentReference,
                        provider: input.provider,
                        providerReference: input.providerReference,
                      }
                )
              );
              return paymentReference;
            })
          ),
          saveNetTerms: Effect.fn("PaymentRepository.memory.saveNetTerms")(
            (input) => Effect.succeed(seed.netTermsPaymentReferenceFor(input))
          ),
        });
      })
    );
}
