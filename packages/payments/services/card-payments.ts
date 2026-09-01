import { Context, Effect, Layer } from "effect";

import type {
  PaymentConfirmationReference,
  PaymentConfirmationUnavailable,
  PaymentConfirmationUnavailableReason,
  PaymentCheckout,
  PaymentProviderFailure,
  PaymentProviderReference,
} from "../domain";
import {
  PaymentConfirmationUnavailable as ConfirmationUnavailable,
  PaymentProvider,
} from "../domain";

export interface PrepareCardPaymentInput {
  readonly checkout: PaymentCheckout;
  readonly providerReference?: PaymentProviderReference;
}

export interface CardPreparation {
  readonly clientToken: string;
  readonly providerReference: PaymentProviderReference;
  readonly publicConfiguration: string;
}

export interface ValidateCardConfirmationInput {
  readonly confirmationReference: PaymentConfirmationReference;
}

export type PaymentConfirmationAvailability =
  | "available"
  | PaymentConfirmationUnavailableReason;

export interface CardPaymentsMemorySeed {
  readonly clientTokenFor: (input: PrepareCardPaymentInput) => string;
  readonly confirmationAvailabilityFor: (
    input: ValidateCardConfirmationInput
  ) => PaymentConfirmationAvailability;
  readonly providerReferenceFor: (
    input: PrepareCardPaymentInput
  ) => PaymentProviderReference;
  readonly provider: string;
  readonly publicConfiguration: string;
}

export class CardPayments extends Context.Service<
  CardPayments,
  {
    readonly provider: PaymentProvider;
    readonly prepare: (
      input: PrepareCardPaymentInput
    ) => Effect.Effect<CardPreparation, PaymentProviderFailure>;
    readonly validateConfirmation: (
      input: ValidateCardConfirmationInput
    ) => Effect.Effect<
      void,
      PaymentConfirmationUnavailable | PaymentProviderFailure
    >;
  }
>()("@repo/payments/CardPayments") {
  static readonly layerMemory = (seed: CardPaymentsMemorySeed) =>
    Layer.succeed(
      CardPayments,
      CardPayments.of({
        prepare: Effect.fn("CardPayments.memory.prepare")((input) =>
          Effect.succeed({
            clientToken: seed.clientTokenFor(input),
            providerReference:
              input.providerReference ?? seed.providerReferenceFor(input),
            publicConfiguration: seed.publicConfiguration,
          })
        ),
        provider: PaymentProvider.make(seed.provider),
        validateConfirmation: Effect.fn(
          "CardPayments.memory.validateConfirmation"
        )(function* (input) {
          const availability = seed.confirmationAvailabilityFor(input);
          if (availability !== "available") {
            return yield* new ConfirmationUnavailable({
              confirmationReference: input.confirmationReference,
              reason: availability,
            });
          }
        }),
      })
    );
}
