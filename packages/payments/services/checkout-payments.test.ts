import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer, Option } from "effect";

import type { PaymentOptions } from "../domain";
import {
  PaymentAccountReference,
  PaymentCheckoutReference,
  PaymentConfirmationReference,
  PaymentProvider,
  PaymentProviderFailure,
  PaymentProviderReference,
  PaymentReference,
} from "../domain";
import { AccountCredit } from "./account-credit";
import { CardPayments } from "./card-payments";
import type { PaymentConfirmationAvailability } from "./card-payments";
import { CheckoutPayments } from "./checkout-payments";
import { PaymentRepository } from "./payment-repository";

const checkoutWithAmount = (centAmount: number, currencyCode: string) => ({
  amount: { centAmount, currencyCode },
  reference: PaymentCheckoutReference.make("checkout-under-test"),
});

const accountReference = PaymentAccountReference.make("account-under-test");
const cardProviderReference = PaymentProviderReference.make(
  "card-provider-reference-from-seed"
);
const cardPaymentReference = PaymentReference.make("card-payment-from-seed");
const netTermsPaymentReference = PaymentReference.make(
  "net-terms-payment-from-seed"
);
const publicConfiguration = "public-configuration-from-seed";

const layerFor = (
  availableCredit: {
    readonly centAmount: number;
    readonly currencyCode: string;
  },
  approvedForCredit = true,
  confirmationAvailability: PaymentConfirmationAvailability = "available"
) =>
  CheckoutPayments.layerMemory({
    card: {
      clientTokenFor: ({ checkout, providerReference }) =>
        `client-token:${checkout.reference}:${checkout.amount.centAmount}:${checkout.amount.currencyCode}:${providerReference ?? "new"}`,
      confirmationAvailabilityFor: ({ confirmationReference }) => {
        expect(confirmationReference).toBe(
          "confirmation-reference-from-browser"
        );
        return confirmationAvailability;
      },
      provider: "Memory Card Provider",
      providerReferenceFor: () => cardProviderReference,
      publicConfiguration,
    },
    cardPaymentReferenceFor: ({ checkout, provider, providerReference }) => {
      expect(checkout.reference).toBe("checkout-under-test");
      expect(provider).toBe("Memory Card Provider");
      expect(providerReference).toBe(cardProviderReference);
      return cardPaymentReference;
    },
    creditProfiles: approvedForCredit
      ? [
          {
            accountReference,
            availableCredit,
            termsInDays: 30,
          },
        ]
      : [],
    netTermsPaymentReferenceFor: ({ checkout, provider, termsInDays }) => {
      expect(checkout.amount).toStrictEqual(
        expect.objectContaining({ currencyCode: "USD" })
      );
      expect(provider).toBe("MemoryAccountCredit");
      expect(termsInDays).toBe(30);
      return netTermsPaymentReference;
    },
  });

const billingAddress = {
  addressLine1: "1 Parameterized Way",
  city: "Testville",
  country: "US",
  postalCode: "10001",
};

const requireCardInput = (options: PaymentOptions) => {
  const card = options.methods.find((method) => method.method === "card");
  if (card === undefined) {
    throw new Error("Expected Card preparation input");
  }
  return card.input;
};

describe(CheckoutPayments, () => {
  it.effect(
    "derives Card and Net Terms eligibility from explicit inputs",
    () => {
      const checkout = checkoutWithAmount(1_700_000, "USD");
      const availableCredit = {
        centAmount: 2_000_000,
        currencyCode: "USD",
      };

      return Effect.gen(function* () {
        const options = yield* CheckoutPayments.prepare({
          buyer: { accountReference, type: "company" },
          checkout,
        });
        const { preparationReference } = requireCardInput(options);

        expect(preparationReference.length).toBeGreaterThan(0);
        expect(options).toStrictEqual({
          amount: checkout.amount,
          methods: [
            {
              availability: "available",
              displayName: "Card",
              input: {
                clientIntegration: {
                  clientToken: `client-token:${checkout.reference}:${checkout.amount.centAmount}:${checkout.amount.currencyCode}:new`,
                  provider: "Memory Card Provider",
                  publicConfiguration,
                },
                preparationReference,
              },
              method: "card",
            },
            {
              availability: "available",
              availableCredit,
              displayName: "Net 30",
              method: "netTerms",
              termsInDays: 30,
            },
          ],
        });
      }).pipe(Effect.provide(layerFor(availableCredit)));
    }
  );

  it.effect("rejects a browser-invented Card confirmation reference", () => {
    const checkout = checkoutWithAmount(1_700_000, "USD");

    return Effect.gen(function* () {
      const options = yield* CheckoutPayments.prepare({
        buyer: { type: "guest" },
        checkout,
      });
      const cardInput = requireCardInput(options);
      const failure = yield* CheckoutPayments.save({
        billingAddress,
        buyer: { type: "guest" },
        checkout,
        selection: {
          confirmationReference: PaymentConfirmationReference.make(
            "confirmation-reference-from-browser"
          ),
          method: "card",
          preparationReference: cardInput.preparationReference,
        },
      }).pipe(Effect.flip);

      expect(failure).toMatchObject({
        _tag: "PaymentPreparationUnavailable",
        checkoutReference: checkout.reference,
        preparationReference: cardInput.preparationReference,
        reason: "confirmationUnavailable",
      });
    }).pipe(
      Effect.provide(
        layerFor(
          { centAmount: 2_000_000, currencyCode: "USD" },
          true,
          "notFound"
        )
      )
    );
  });

  it.effect(
    "validates and returns the browser confirmation reference without authorizing Card",
    () => {
      const checkout = checkoutWithAmount(1_700_000, "USD");
      const confirmationReference = PaymentConfirmationReference.make(
        "confirmation-reference-from-browser"
      );

      return Effect.gen(function* () {
        const options = yield* CheckoutPayments.prepare({
          buyer: { type: "guest" },
          checkout,
        });
        const cardInput = requireCardInput(options);
        const payment = yield* CheckoutPayments.save({
          billingAddress,
          buyer: { type: "guest" },
          checkout,
          selection: {
            confirmationReference,
            method: "card",
            preparationReference: cardInput.preparationReference,
          },
        });

        expect(payment).toStrictEqual({
          amount: checkout.amount,
          billingAddress,
          confirmationReference,
          method: "card",
          paymentReference: cardPaymentReference,
          preparationReference: cardInput.preparationReference,
        });
      }).pipe(
        Effect.provide(layerFor({ centAmount: 2_000_000, currencyCode: "USD" }))
      );
    }
  );

  it.effect(
    "saves a Card selection without confirmation for a deferred client handoff",
    () => {
      const checkout = checkoutWithAmount(1_700_000, "USD");

      return Effect.gen(function* () {
        const options = yield* CheckoutPayments.prepare({
          buyer: { type: "guest" },
          checkout,
        });
        const cardInput = requireCardInput(options);
        const payment = yield* CheckoutPayments.save({
          billingAddress,
          buyer: { type: "guest" },
          checkout,
          selection: {
            method: "card",
            preparationReference: cardInput.preparationReference,
          },
        });

        expect(payment).toStrictEqual({
          amount: checkout.amount,
          billingAddress,
          method: "card",
          paymentReference: cardPaymentReference,
          preparationReference: cardInput.preparationReference,
        });
      }).pipe(
        Effect.provide(layerFor({ centAmount: 2_000_000, currencyCode: "USD" }))
      );
    }
  );

  it.effect("omits Net Terms for an unapproved Business Unit", () => {
    const checkout = checkoutWithAmount(1_700_000, "USD");
    const availableCredit = {
      centAmount: 2_000_000,
      currencyCode: "USD",
    };

    return Effect.gen(function* () {
      const options = yield* CheckoutPayments.prepare({
        buyer: { accountReference, type: "company" },
        checkout,
      });

      expect(options.methods).toStrictEqual([
        {
          availability: "available",
          displayName: "Card",
          input: requireCardInput(options),
          method: "card",
        },
      ]);
    }).pipe(Effect.provide(layerFor(availableCredit, false)));
  });

  it.effect("retains Net Terms when Card preparation is unavailable", () => {
    const checkout = checkoutWithAmount(1_700_000, "USD");
    const availableCredit = {
      centAmount: 2_000_000,
      currencyCode: "USD",
    };
    const cardFailure = new PaymentProviderFailure({
      cause: new Error("Card provider unavailable"),
      operation: "card.prepare",
      reason: "unavailable",
    });
    const cardLayer = Layer.succeed(
      CardPayments,
      CardPayments.of({
        prepare: (input) => {
          expect(input.checkout).toStrictEqual(checkout);
          return Effect.fail(cardFailure);
        },
        provider: PaymentProvider.make("Unavailable Card Provider"),
        validateConfirmation: () => Effect.die("not used"),
      })
    );
    const paymentsLayer = CheckoutPayments.layer.pipe(
      Layer.provide(
        Layer.mergeAll(
          cardLayer,
          AccountCredit.layerMemory(
            new Map([[accountReference, { availableCredit, termsInDays: 30 }]])
          ),
          PaymentRepository.layerMemory({
            cardPaymentReferenceFor: () => cardPaymentReference,
            netTermsPaymentReferenceFor: () => netTermsPaymentReference,
          })
        )
      )
    );

    return Effect.gen(function* () {
      const options = yield* CheckoutPayments.prepare({
        buyer: { accountReference, type: "company" },
        checkout,
      });

      expect(options).toStrictEqual({
        amount: checkout.amount,
        methods: [
          {
            availability: "available",
            availableCredit,
            displayName: "Net 30",
            method: "netTerms",
            termsInDays: 30,
          },
        ],
      });
    }).pipe(Effect.provide(paymentsLayer));
  });

  it.effect("retains Card when account credit is unavailable", () => {
    const checkout = checkoutWithAmount(1_700_000, "USD");
    const creditFailure = new PaymentProviderFailure({
      cause: new Error("ERP unavailable"),
      operation: "accountCredit.find",
      reason: "unavailable",
    });
    const accountCreditLayer = Layer.succeed(
      AccountCredit,
      AccountCredit.of({ find: () => Effect.fail(creditFailure) })
    );
    const paymentsLayer = CheckoutPayments.layer.pipe(
      Layer.provide(
        Layer.mergeAll(
          CardPayments.layerMemory({
            clientTokenFor: ({ checkout: submitted }) => {
              expect(submitted).toStrictEqual(checkout);
              return "client-token-from-card-provider";
            },
            confirmationAvailabilityFor: () => "available",
            provider: "Memory Card Provider",
            providerReferenceFor: () => cardProviderReference,
            publicConfiguration,
          }),
          accountCreditLayer,
          PaymentRepository.layerMemory({
            cardPaymentReferenceFor: () => cardPaymentReference,
            netTermsPaymentReferenceFor: () => netTermsPaymentReference,
          })
        )
      )
    );

    return Effect.gen(function* () {
      const options = yield* CheckoutPayments.prepare({
        buyer: { accountReference, type: "company" },
        checkout,
      });

      expect(options).toStrictEqual({
        amount: checkout.amount,
        methods: [
          {
            availability: "available",
            displayName: "Card",
            input: requireCardInput(options),
            method: "card",
          },
        ],
      });
      expect(requireCardInput(options).clientIntegration).toStrictEqual({
        clientToken: "client-token-from-card-provider",
        provider: "Memory Card Provider",
        publicConfiguration,
      });
      expect(
        requireCardInput(options).preparationReference.length
      ).toBeGreaterThan(0);
    }).pipe(Effect.provide(paymentsLayer));
  });

  it.effect(
    "rejects a persisted Card reference owned by another provider before reuse",
    () => {
      const checkout = checkoutWithAmount(1_700_000, "USD");
      let providerCalled = false;
      const cardLayer = Layer.succeed(
        CardPayments,
        CardPayments.of({
          prepare: () => {
            providerCalled = true;
            return Effect.die("A mismatched reference must not reach Card");
          },
          provider: PaymentProvider.make("Current Card Provider"),
          validateConfirmation: () => Effect.die("not used"),
        })
      );
      const repositoryLayer = Layer.succeed(
        PaymentRepository,
        PaymentRepository.of({
          findCard: () =>
            Effect.succeed(
              Option.some({
                paymentReference: cardPaymentReference,
                provider: PaymentProvider.make("Previous Card Provider"),
                providerReference: cardProviderReference,
              })
            ),
          saveCard: () => Effect.die("not used"),
          saveNetTerms: () => Effect.die("not used"),
        })
      );
      const paymentsLayer = CheckoutPayments.layer.pipe(
        Layer.provide(
          Layer.mergeAll(
            cardLayer,
            AccountCredit.layerMemory(new Map()),
            repositoryLayer
          )
        )
      );

      return Effect.gen(function* () {
        const failure = yield* CheckoutPayments.prepare({
          buyer: { type: "guest" },
          checkout,
        }).pipe(Effect.flip);

        expect(failure).toMatchObject({
          _tag: "PaymentProviderFailure",
          operation: "cardPayment.prepare",
          reason: "invalidData",
        });
        expect(providerCalled).toBeFalsy();
      }).pipe(Effect.provide(paymentsLayer));
    }
  );

  it.effect(
    "rejects a Card preparation when the parameterized Checkout amount changes",
    () => {
      const preparedCheckout = checkoutWithAmount(1_700_000, "USD");
      const changedCheckout = checkoutWithAmount(1_725_000, "USD");

      return Effect.gen(function* () {
        const options = yield* CheckoutPayments.prepare({
          buyer: { type: "guest" },
          checkout: preparedCheckout,
        });
        const cardInput = requireCardInput(options);
        const failure = yield* CheckoutPayments.save({
          billingAddress,
          buyer: { type: "guest" },
          checkout: changedCheckout,
          selection: {
            confirmationReference: PaymentConfirmationReference.make(
              "confirmation-reference-for-stale-amount"
            ),
            method: "card",
            preparationReference: cardInput.preparationReference,
          },
        }).pipe(Effect.flip);

        expect(failure).toMatchObject({
          _tag: "PaymentPreparationUnavailable",
          checkoutReference: changedCheckout.reference,
          preparationReference: cardInput.preparationReference,
          reason: "amountChanged",
        });
      }).pipe(
        Effect.provide(layerFor({ centAmount: 2_000_000, currencyCode: "USD" }))
      );
    }
  );

  it.effect(
    "reports the parameterized balance when Net Terms is ineligible for the amount",
    () => {
      const checkout = checkoutWithAmount(1_700_000, "USD");
      const availableCredit = {
        centAmount: 1_600_000,
        currencyCode: "USD",
      };

      return Effect.gen(function* () {
        const options = yield* CheckoutPayments.prepare({
          buyer: { accountReference, type: "company" },
          checkout,
        });
        expect(
          options.methods.find((method) => method.method === "netTerms")
        ).toStrictEqual({
          availability: "unavailable",
          availableCredit,
          displayName: "Net 30",
          method: "netTerms",
          termsInDays: 30,
          unavailableReason: "insufficientAvailableCredit",
        });

        const failure = yield* CheckoutPayments.save({
          billingAddress,
          buyer: { accountReference, type: "company" },
          checkout,
          selection: { method: "netTerms" },
        }).pipe(Effect.flip);
        expect(failure).toMatchObject({
          _tag: "PaymentMethodUnavailable",
          availableCredit,
          method: "netTerms",
          reason: "insufficientAvailableCredit",
        });
      }).pipe(Effect.provide(layerFor(availableCredit)));
    }
  );
});
