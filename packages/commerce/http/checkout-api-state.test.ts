import { describe, expect, it } from "@effect/vitest";
import {
  PaymentAttemptReference,
  PaymentReference,
  PreparedPaymentReference,
} from "@repo/payments";

import { CountryCode } from "../domain/address";
import { CartId, LineItemId, ProductId, VariantId } from "../domain/cart";
import { CartSnapshotVersion } from "../domain/cart-snapshot";
import type { CartSnapshot } from "../domain/cart-snapshot";
import { StorefrontAnonymousCheckoutScope } from "../domain/checkout";
import type { CheckoutState } from "../domain/checkout-state";
import { money } from "../domain/money";
import { CommerceLocale, StoreKey } from "../store";
import { toCheckoutApiState } from "./checkout-api-state";

describe(toCheckoutApiState, () => {
  it("keeps internal parameterized Payment references out of the public state", () => {
    const amount = money(1_700_000, "USD");
    const billingAddress = {
      addressLine1: "1 Private Payment Way",
      city: "New York",
      country: CountryCode.make("US"),
      postalCode: "10001",
    };
    const preparedPayment = {
      amount,
      attemptReference: PaymentAttemptReference.make("private-attempt"),
      billingAddress,
      method: "card" as const,
      paymentReference: PaymentReference.make("private-payment-reference"),
      preparationReference: PreparedPaymentReference.make(
        "private-preparation-reference"
      ),
    };
    const checkoutDetails = { preparedPayment };
    const cart: CartSnapshot = {
      checkoutDetails,
      id: CartId.make("cart-with-prepared-payment"),
      lineItems: [
        {
          id: LineItemId.make("line-with-prepared-payment"),
          quantity: 1,
          totalPrice: amount,
          unitPrice: amount,
          variant: {
            id: VariantId.make("variant-with-prepared-payment"),
            images: [],
            productId: ProductId.make("product-with-prepared-payment"),
          },
        },
      ],
      status: "active",
      storeKey: StoreKey.make("store-with-prepared-payment"),
      totalLineItemQuantity: 1,
      totalPrice: amount,
      version: CartSnapshotVersion.make("cart-1"),
    };
    const state: CheckoutState = {
      activeStep: "reviewOrder",
      cart,
      details: checkoutDetails,
      scope: new StorefrontAnonymousCheckoutScope({
        anonymousCartId: cart.id,
        channel: "storefrontAnonymous",
        locale: CommerceLocale.make("en-US"),
      }),
      steps: [],
      violations: [],
    };

    const projected = toCheckoutApiState(state);

    const publicPayment = { amount, method: "card" };
    expect(projected.details.preparedPayment).toStrictEqual(publicPayment);
    expect(projected.cart.checkoutDetails.preparedPayment).toStrictEqual(
      publicPayment
    );
    const serialized = JSON.stringify(projected);
    expect(serialized).not.toContain(preparedPayment.paymentReference);
    expect(serialized).not.toContain(preparedPayment.preparationReference);
  });
});
