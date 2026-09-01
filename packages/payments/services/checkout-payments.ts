import { Context, Effect, Layer } from "effect";

import type {
  CheckoutPaymentBuyer,
  PaymentAccountReference,
  PaymentBillingAddress,
  PaymentCheckout,
  PaymentMethodUnavailable,
  PaymentOptions,
  PaymentPreparationUnavailable,
  PaymentProviderFailure,
  PaymentSelection,
  PreparedPayment,
} from "../domain";
import { AccountCredit } from "./account-credit";
import type { CreditProfile } from "./account-credit";
import { CardPaymentMethod } from "./card-payment-method";
import { CardPayments } from "./card-payments";
import type { CardPaymentsMemorySeed } from "./card-payments";
import { NetTermsPaymentMethod } from "./net-terms-payment-method";
import { PaymentRepository } from "./payment-repository";
import type { PaymentRepositoryMemorySeed } from "./payment-repository";

export interface PrepareCheckoutPaymentsInput {
  readonly buyer: CheckoutPaymentBuyer;
  readonly checkout: PaymentCheckout;
}

export interface SaveCheckoutPaymentInput extends PrepareCheckoutPaymentsInput {
  readonly billingAddress: PaymentBillingAddress;
  readonly selection: PaymentSelection;
}

export type PrepareCheckoutPaymentsFailure = PaymentProviderFailure;

export type SaveCheckoutPaymentFailure =
  | PaymentMethodUnavailable
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

export class CheckoutPayments extends Context.Service<
  CheckoutPayments,
  {
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
                billingAddress: input.billingAddress,
                checkout: input.checkout,
                selection: input.selection,
              })
            : netTerms.save({
                billingAddress: input.billingAddress,
                buyer: input.buyer,
                checkout: input.checkout,
              })
      );

      return CheckoutPayments.of({ prepare, save });
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
