import { Context, Effect, Layer, Option } from "effect";

import {
  cardPreparationBelongsToCheckout,
  cardPreparationReferenceFor,
  PaymentProviderFailure,
  PaymentPreparationUnavailable,
} from "../domain";
import type {
  CardPaymentOption,
  CardPaymentSelection,
  PaymentBillingAddress,
  PaymentCheckout,
  PreparedCardPayment,
} from "../domain";
import { CardPayments } from "./card-payments";
import { PaymentRepository } from "./payment-repository";

export interface SaveCardPaymentMethodInput {
  readonly billingAddress: PaymentBillingAddress;
  readonly checkout: PaymentCheckout;
  readonly selection: CardPaymentSelection;
}

const preparationFailureReason = (
  checkout: PaymentCheckout,
  submitted: CardPaymentSelection["preparationReference"]
): PaymentPreparationUnavailable["reason"] =>
  cardPreparationBelongsToCheckout(checkout, submitted)
    ? "amountChanged"
    : "notFound";

const providerIdentityMismatch = (expected: string, actual: string) =>
  new PaymentProviderFailure({
    cause: new Error(
      `Card Payment belongs to provider ${actual}, not ${expected}`
    ),
    operation: "cardPayment.prepare",
    reason: "invalidData",
  });

export class CardPaymentMethod extends Context.Service<
  CardPaymentMethod,
  {
    readonly prepare: (
      checkout: PaymentCheckout
    ) => Effect.Effect<CardPaymentOption, PaymentProviderFailure>;
    readonly save: (
      input: SaveCardPaymentMethodInput
    ) => Effect.Effect<
      PreparedCardPayment,
      PaymentPreparationUnavailable | PaymentProviderFailure
    >;
  }
>()("@repo/payments/CardPaymentMethod") {
  static readonly layer = Layer.effect(
    CardPaymentMethod,
    Effect.gen(function* () {
      const cards = yield* CardPayments;
      const repository = yield* PaymentRepository;

      const preparePayment = Effect.fn("CardPaymentMethod.preparePayment")(
        (checkout: PaymentCheckout) =>
          Effect.gen(function* () {
            const existing = yield* repository.findCard(checkout.reference);
            const providerReference = yield* Option.match(existing, {
              onNone: () => Effect.void,
              onSome: (record) =>
                record.provider === cards.provider
                  ? Effect.succeed(record.providerReference)
                  : Effect.fail(
                      providerIdentityMismatch(cards.provider, record.provider)
                    ),
            });
            const input =
              providerReference === undefined
                ? { checkout }
                : { checkout, providerReference };
            const card = yield* cards.prepare(input);
            const paymentReference = yield* repository.saveCard({
              checkout,
              provider: cards.provider,
              providerReference: card.providerReference,
            });
            return { card, paymentReference };
          })
      );

      const prepare = Effect.fn("CardPaymentMethod.prepare")(
        (checkout: PaymentCheckout) =>
          preparePayment(checkout).pipe(
            Effect.map(({ card }) => ({
              availability: "available" as const,
              displayName: "Card",
              input: {
                clientIntegration: {
                  clientToken: card.clientToken,
                  provider: cards.provider,
                  publicConfiguration: card.publicConfiguration,
                },
                preparationReference: cardPreparationReferenceFor(checkout),
              },
              method: "card" as const,
            }))
          )
      );

      const save = Effect.fn("CardPaymentMethod.save")(
        (input: SaveCardPaymentMethodInput) =>
          Effect.gen(function* () {
            const expectedReference = cardPreparationReferenceFor(
              input.checkout
            );
            if (input.selection.preparationReference !== expectedReference) {
              return yield* new PaymentPreparationUnavailable({
                checkoutReference: input.checkout.reference,
                preparationReference: input.selection.preparationReference,
                reason: preparationFailureReason(
                  input.checkout,
                  input.selection.preparationReference
                ),
              });
            }
            const { card, paymentReference } = yield* preparePayment(
              input.checkout
            );
            if (input.selection.confirmationReference !== undefined) {
              yield* cards
                .validateConfirmation({
                  confirmationReference: input.selection.confirmationReference,
                })
                .pipe(
                  Effect.catchTag("PaymentConfirmationUnavailable", () =>
                    Effect.fail(
                      new PaymentPreparationUnavailable({
                        checkoutReference: input.checkout.reference,
                        preparationReference: expectedReference,
                        reason: "confirmationUnavailable",
                      })
                    )
                  )
                );
            }
            const savedPayment = {
              checkout: input.checkout,
              provider: cards.provider,
              providerReference: card.providerReference,
            };
            const savedPaymentReference = yield* repository.saveCard(
              input.selection.confirmationReference === undefined
                ? savedPayment
                : {
                    ...savedPayment,
                    confirmationReference:
                      input.selection.confirmationReference,
                  }
            );
            if (savedPaymentReference !== paymentReference) {
              return yield* Effect.die(
                new Error(
                  "PaymentRepository changed the Card Payment identity while saving its Checkout selection"
                )
              );
            }
            const prepared = {
              amount: input.checkout.amount,
              billingAddress: input.billingAddress,
              method: "card" as const,
              paymentReference: savedPaymentReference,
              preparationReference: expectedReference,
            };
            return input.selection.confirmationReference === undefined
              ? prepared
              : {
                  ...prepared,
                  confirmationReference: input.selection.confirmationReference,
                };
          })
      );

      return CardPaymentMethod.of({ prepare, save });
    })
  );
}
