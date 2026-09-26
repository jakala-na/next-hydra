import { Context, Effect, Layer } from "effect";

import type {
  PaymentAuthorization,
  PaymentConfirmationReference,
  PaymentConfirmationUnavailable,
  PaymentConfirmationUnavailableReason,
  PaymentCheckout,
  PaymentOperationDeclined,
  PaymentOperationReference,
  PaymentProviderFailure,
  PaymentProviderReference,
  PaymentProviderTransactionReference,
} from "../domain";
import {
  CardBrand,
  CardLastFour,
  PaymentConfirmationUnavailable as ConfirmationUnavailable,
  PaymentProvider,
  PaymentProviderTransactionReference as ProviderTransactionReference,
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

export interface AuthorizeCardPaymentInput {
  readonly checkout: PaymentCheckout;
  readonly confirmationReference: PaymentConfirmationReference;
  readonly operationReference: PaymentOperationReference;
  readonly providerReference: PaymentProviderReference;
}

export interface CompleteCardPaymentInput {
  readonly checkout: PaymentCheckout;
  readonly operationReference: PaymentOperationReference;
  readonly providerReference: PaymentProviderReference;
}

export interface CardPaymentOperationResult {
  readonly providerTransactionReference?: PaymentProviderTransactionReference;
}

export type PaymentConfirmationAvailability =
  | "available"
  | PaymentConfirmationUnavailableReason;

export interface CardPaymentsMemorySeed {
  readonly authorizationFor?: (
    input: AuthorizeCardPaymentInput
  ) => PaymentAuthorization;
  readonly captureFailureFor?: (
    input: CompleteCardPaymentInput
  ) => PaymentOperationDeclined | PaymentProviderFailure | undefined;
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
    readonly authorize: (
      input: AuthorizeCardPaymentInput
    ) => Effect.Effect<
      PaymentAuthorization,
      PaymentOperationDeclined | PaymentProviderFailure
    >;
    readonly cancelAuthorization: (
      input: CompleteCardPaymentInput
    ) => Effect.Effect<CardPaymentOperationResult, PaymentProviderFailure>;
    readonly capture: (
      input: CompleteCardPaymentInput
    ) => Effect.Effect<
      CardPaymentOperationResult,
      PaymentOperationDeclined | PaymentProviderFailure
    >;
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
        authorize: Effect.fn("CardPayments.memory.authorize")((input) =>
          Effect.succeed(seed.authorizationFor?.(input)).pipe(
            Effect.map(
              (authorization) =>
                authorization ?? {
                  _tag: "Authorized" as const,
                  paymentMethod: {
                    cardBrand: CardBrand.make("visa"),
                    lastFour: CardLastFour.make("4242"),
                    method: "card" as const,
                  },
                  providerTransactionReference:
                    ProviderTransactionReference.make(
                      `provider-${input.operationReference}`
                    ),
                }
            ),
            Effect.map((authorization) =>
              authorization._tag === "Authorized"
                ? authorization
                : {
                    ...authorization,
                    provider: PaymentProvider.make(seed.provider),
                    publicConfiguration: seed.publicConfiguration,
                  }
            )
          )
        ),
        cancelAuthorization: Effect.fn(
          "CardPayments.memory.cancelAuthorization"
        )((input) =>
          Effect.succeed({
            providerTransactionReference: ProviderTransactionReference.make(
              `provider-${input.operationReference}`
            ),
          })
        ),
        capture: Effect.fn("CardPayments.memory.capture")(function* (input) {
          const failure = seed.captureFailureFor?.(input);
          if (failure !== undefined) {
            return yield* failure;
          }
          return {
            providerTransactionReference: ProviderTransactionReference.make(
              `provider-${input.operationReference}`
            ),
          };
        }),
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
