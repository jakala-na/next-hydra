import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer, Option } from "effect";

import {
  CardBrand,
  CardLastFour,
  PaymentAccountReference,
  PaymentAttemptReference,
  PaymentCheckoutReference,
  PaymentConfirmationReference,
  PaymentOperationDeclined,
  PaymentOrderReference,
  PaymentProviderReference,
  PaymentProviderFailure,
  PaymentReference,
} from "../domain";
import { AccountCredit } from "./account-credit";
import { CardPayments } from "./card-payments";
import { CheckoutPayments } from "./checkout-payments";
import { PaymentRepository } from "./payment-repository";

const checkout = {
  amount: { centAmount: 1_700_000, currencyCode: "USD" },
  reference: PaymentCheckoutReference.make("cart-from-input"),
};
const billingAddress = {
  addressLine1: "1 Parameterized Way",
  city: "Testville",
  country: "US",
  postalCode: "10001",
};
const cardPaymentReference = PaymentReference.make("card-payment-from-input");
const cardProviderReference = PaymentProviderReference.make("pi-from-provider");
const accountReference = PaymentAccountReference.make("business-unit-input");
const attemptReference = PaymentAttemptReference.make("placement-input");

const operationLayer = (
  captureFailure?: PaymentOperationDeclined | PaymentProviderFailure
) => {
  let authorizations = 0;
  let captures = 0;
  const base = Layer.mergeAll(
    AccountCredit.layerMemory(
      new Map([
        [
          accountReference,
          {
            availableCredit: { centAmount: 2_000_000, currencyCode: "USD" },
            termsInDays: 30,
          },
        ],
      ])
    ),
    CardPayments.layerMemory({
      authorizationFor: ({ confirmationReference }) => {
        expect(confirmationReference).toBe("ctoken-from-input");
        authorizations += 1;
        return {
          _tag: "Authorized",
          paymentMethod: {
            cardBrand: CardBrand.make("visa"),
            lastFour: CardLastFour.make("4242"),
            method: "card",
          },
        };
      },
      captureFailureFor: () => {
        captures += 1;
        return captureFailure;
      },
      clientTokenFor: () => "client-secret-from-provider",
      confirmationAvailabilityFor: () => "available",
      provider: "Memory Card Provider",
      providerReferenceFor: () => cardProviderReference,
      publicConfiguration: "pk_test_from-provider",
    }),
    PaymentRepository.layerMemory({
      cardPaymentReferenceFor: () => cardPaymentReference,
      netTermsPaymentReferenceFor: () =>
        PaymentReference.make("net-terms-payment-from-input"),
    })
  );
  return {
    calls: () => ({ authorizations, captures }),
    layer: Layer.merge(base, CheckoutPayments.layer.pipe(Layer.provide(base))),
  };
};

const saveCard = Effect.gen(function* () {
  const options = yield* CheckoutPayments.prepare({
    buyer: { type: "guest" },
    checkout,
  });
  const card = options.methods.find((method) => method.method === "card");
  if (card === undefined) {
    return yield* Effect.die("Card was not prepared");
  }
  return yield* CheckoutPayments.save({
    attemptReference,
    billingAddress,
    buyer: { type: "guest" },
    checkout,
    selection: {
      confirmationReference:
        PaymentConfirmationReference.make("ctoken-from-input"),
      method: "card",
      preparationReference: card.input.preparationReference,
    },
  });
});

describe("Checkout Payment operations", () => {
  it.effect(
    "authorizes and captures Card once while persisting each state",
    () => {
      const { calls, layer } = operationLayer();

      return Effect.gen(function* () {
        const payment = yield* saveCard;
        const common = {
          buyer: { type: "guest" as const },
          checkout,
          payment,
          paymentReference: payment.paymentReference,
        };

        yield* CheckoutPayments.authorize(common);
        yield* CheckoutPayments.authorize(common);
        yield* CheckoutPayments.finalize({
          ...common,
          orderReference: PaymentOrderReference.make("order-from-provider"),
        });
        yield* CheckoutPayments.finalize({
          ...common,
          orderReference: PaymentOrderReference.make("order-from-provider"),
        });

        const repository = yield* PaymentRepository;
        const transactions = yield* repository.findTransactions(
          payment.paymentReference
        );
        expect(calls()).toStrictEqual({ authorizations: 1, captures: 1 });
        expect(transactions).toMatchObject([
          { state: "Success", type: "Authorization" },
          { state: "Success", type: "Charge" },
        ]);
        expect(
          yield* CheckoutPayments.getPaymentMethod(payment.paymentReference)
        ).toStrictEqual({
          cardBrand: "visa",
          lastFour: "4242",
          method: "card",
        });
      }).pipe(Effect.provide(layer));
    }
  );

  it.effect("records a definitive Card capture failure", () => {
    const { layer } = operationLayer(
      new PaymentOperationDeclined({
        message: "Capture was declined",
        operation: "capture",
      })
    );
    return Effect.gen(function* () {
      const payment = yield* saveCard;
      const common = {
        buyer: { type: "guest" as const },
        checkout,
        payment,
        paymentReference: payment.paymentReference,
      };
      yield* CheckoutPayments.authorize(common);
      yield* CheckoutPayments.finalize({
        ...common,
        orderReference: PaymentOrderReference.make("order-from-provider"),
      }).pipe(Effect.flip);

      const repository = yield* PaymentRepository;
      const transactions = yield* repository.findTransactions(
        payment.paymentReference
      );
      expect(transactions).toMatchObject([
        { state: "Success", type: "Authorization" },
        { state: "Failure", type: "Charge" },
      ]);
    }).pipe(Effect.provide(layer));
  });

  it.effect("leaves an uncertain Card capture pending", () => {
    const { layer } = operationLayer(
      new PaymentProviderFailure({
        operation: "card.capture",
        reason: "outcomeUnknown",
      })
    );
    return Effect.gen(function* () {
      const payment = yield* saveCard;
      const common = {
        buyer: { type: "guest" as const },
        checkout,
        payment,
        paymentReference: payment.paymentReference,
      };
      yield* CheckoutPayments.authorize(common);
      yield* CheckoutPayments.finalize({
        ...common,
        orderReference: PaymentOrderReference.make("order-from-provider"),
      }).pipe(Effect.flip);

      const repository = yield* PaymentRepository;
      expect(
        yield* repository.findTransactions(payment.paymentReference)
      ).toMatchObject([
        { state: "Success", type: "Authorization" },
        { state: "Pending", type: "Charge" },
      ]);
    }).pipe(Effect.provide(layer));
  });

  it.effect("does not reuse a released Card authorization", () => {
    const { calls, layer } = operationLayer();

    return Effect.gen(function* () {
      const payment = yield* saveCard;
      const common = {
        buyer: { type: "guest" as const },
        checkout,
        payment,
        paymentReference: payment.paymentReference,
      };
      yield* CheckoutPayments.authorize(common);
      yield* CheckoutPayments.cancelAuthorization(common);
      const failure = yield* CheckoutPayments.authorize(common).pipe(
        Effect.flip
      );

      expect(failure).toMatchObject({
        _tag: "PaymentPreparationUnavailable",
        reason: "authorizationReleased",
      });
      expect(calls().authorizations).toBe(1);
    }).pipe(Effect.provide(layer));
  });

  it.effect("reserves then commits Net Terms credit to its ledger", () => {
    const { layer } = operationLayer();

    return Effect.gen(function* () {
      const payment = yield* CheckoutPayments.save({
        attemptReference,
        billingAddress,
        buyer: { accountReference, type: "company" },
        checkout,
        selection: { method: "netTerms" },
      });
      const common = {
        buyer: { accountReference, type: "company" as const },
        checkout,
        payment,
        paymentReference: payment.paymentReference,
      };
      yield* CheckoutPayments.authorize(common);
      yield* CheckoutPayments.finalize({
        ...common,
        orderReference: PaymentOrderReference.make("order-from-provider"),
      });

      const credit = yield* AccountCredit;
      const profile = Option.getOrThrow(yield* credit.find(accountReference));
      const repository = yield* PaymentRepository;
      const transactions = yield* repository.findTransactions(
        payment.paymentReference
      );
      expect(profile.availableCredit).toStrictEqual({
        centAmount: 300_000,
        currencyCode: "USD",
      });
      expect(profile.ledger).toMatchObject([
        {
          amount: checkout.amount,
          direction: "debit",
          orderReference: "order-from-provider",
        },
      ]);
      expect(transactions).toMatchObject([
        { state: "Success", type: "Authorization" },
        { state: "Success", type: "Charge" },
      ]);
      expect(
        yield* CheckoutPayments.getFinalizationStatus(payment.paymentReference)
      ).toBe("confirmed");
    }).pipe(Effect.provide(layer));
  });

  it.effect("releases Net Terms credit and records the cancellation", () => {
    const { layer } = operationLayer();

    return Effect.gen(function* () {
      const payment = yield* CheckoutPayments.save({
        attemptReference,
        billingAddress,
        buyer: { accountReference, type: "company" },
        checkout,
        selection: { method: "netTerms" },
      });
      const common = {
        buyer: { accountReference, type: "company" as const },
        checkout,
        payment,
        paymentReference: payment.paymentReference,
      };
      yield* CheckoutPayments.authorize(common);
      yield* CheckoutPayments.cancelAuthorization(common);

      const repository = yield* PaymentRepository;
      const transactions = yield* repository.findTransactions(
        payment.paymentReference
      );
      const credit = yield* AccountCredit;
      const profile = Option.getOrThrow(yield* credit.find(accountReference));
      expect(profile.availableCredit).toStrictEqual({
        centAmount: 2_000_000,
        currencyCode: "USD",
      });
      expect(transactions).toMatchObject([
        { state: "Success", type: "Authorization" },
        { state: "Success", type: "CancelAuthorization" },
      ]);
    }).pipe(Effect.provide(layer));
  });
});
