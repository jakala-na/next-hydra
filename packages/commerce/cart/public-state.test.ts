import {
  PaymentAttemptReference,
  PaymentReference,
  PreparedPaymentReference,
} from "@repo/payments";
import { describe, expect, it } from "vitest";

import { CartId } from "../domain/cart";
import type { CurrentCartState } from "../domain/cart-snapshot";
import { StoreKey } from "../store";
import { toCartPublicState } from "./public-state";

describe(toCartPublicState, () => {
  it("removes internal Payment references from the browser Cart state", () => {
    const preparedPayment = {
      amount: { centAmount: 1_700_000, currencyCode: "USD" },
      attemptReference: PaymentAttemptReference.make("private-attempt"),
      billingAddress: {
        addressLine1: "1 Private Payment Way",
        city: "New York",
        country: "US",
        postalCode: "10001",
      },
      method: "card" as const,
      paymentReference: PaymentReference.make("private-payment-reference"),
      preparationReference: PreparedPaymentReference.make(
        "private-preparation-reference"
      ),
    };
    const state: CurrentCartState = {
      cart: {
        checkoutDetails: { preparedPayment },
        id: CartId.make("cart-with-prepared-payment"),
        lineItems: [],
        status: "active",
        storeKey: StoreKey.make("default-store"),
        totalLineItemQuantity: 0,
        totalPrice: preparedPayment.amount,
      },
      violations: [],
    };

    const projected = toCartPublicState(state);

    expect(projected.cart.checkoutDetails.preparedPayment).toStrictEqual({
      amount: preparedPayment.amount,
      method: "card",
    });
    expect(JSON.stringify(projected)).not.toContain(
      preparedPayment.attemptReference
    );
    const serialized = JSON.stringify(projected);
    expect(serialized).not.toContain(preparedPayment.paymentReference);
    expect(serialized).not.toContain(preparedPayment.preparationReference);
  });
});
