import { CountryCode } from "@repo/commerce/domain/checkout";
import {
  PaymentAttemptReference,
  PaymentConfirmationReference,
  PaymentReference,
  PreparedPaymentReference,
} from "@repo/payments";
import { describe, expect, it } from "vitest";

import {
  buildSavePaymentOptionsActions,
  clearSelectedPaymentActions,
} from "./payment-options-actions";

describe(buildSavePaymentOptionsActions, () => {
  it("links only the selected Payment and persists its billing address", () => {
    const previousPaymentId = "previous-payment-from-input";
    const paymentReference = PaymentReference.make(
      "selected-payment-from-input"
    );
    const payment = {
      amount: { centAmount: 1_700_000, currencyCode: "USD" },
      attemptReference: PaymentAttemptReference.make("attempt-from-input"),
      billingAddress: {
        addressLine1: "1 Parameterized Way",
        addressLine2: "Suite 2",
        city: "Testville",
        country: CountryCode.make("US"),
        postalCode: "10001",
        region: "NY",
      },
      confirmationReference: PaymentConfirmationReference.make(
        "confirmation-from-input"
      ),
      method: "card" as const,
      paymentReference,
      preparationReference: PreparedPaymentReference.make(
        "preparation-from-input"
      ),
    };
    const actions = buildSavePaymentOptionsActions(
      { paymentIds: [previousPaymentId] },
      payment
    );

    expect(actions).toStrictEqual([
      {
        action: "removePayment",
        payment: { id: previousPaymentId, typeId: "payment" },
      },
      {
        action: "addPayment",
        payment: { id: paymentReference, typeId: "payment" },
      },
      {
        action: "setBillingAddress",
        address: {
          additionalStreetInfo: payment.billingAddress.addressLine2,
          city: payment.billingAddress.city,
          country: payment.billingAddress.country,
          postalCode: payment.billingAddress.postalCode,
          state: payment.billingAddress.region,
          streetName: payment.billingAddress.addressLine1,
        },
      },
    ]);
  });

  it("omits absent optional billing-address fields", () => {
    const actions = buildSavePaymentOptionsActions(
      { paymentIds: [] },
      {
        amount: { centAmount: 1_700_000, currencyCode: "USD" },
        attemptReference: PaymentAttemptReference.make("attempt-from-input"),
        billingAddress: {
          addressLine1: "1 Parameterized Way",
          city: "Testville",
          country: CountryCode.make("US"),
          postalCode: "10001",
        },
        method: "netTerms",
        paymentReference: PaymentReference.make("payment-from-input"),
        termsInDays: 30,
      }
    );

    expect(
      actions.find((action) => action.action === "setBillingAddress")
    ).toStrictEqual({
      action: "setBillingAddress",
      address: {
        city: "Testville",
        country: "US",
        postalCode: "10001",
        streetName: "1 Parameterized Way",
      },
    });
  });
});

describe(clearSelectedPaymentActions, () => {
  it("detaches linked Payments and removes their billing address", () => {
    expect(
      clearSelectedPaymentActions({
        paymentIds: ["payment-1", "payment-2"],
      })
    ).toStrictEqual([
      {
        action: "removePayment",
        payment: { id: "payment-1", typeId: "payment" },
      },
      {
        action: "removePayment",
        payment: { id: "payment-2", typeId: "payment" },
      },
      { action: "setBillingAddress" },
    ]);
  });
});
