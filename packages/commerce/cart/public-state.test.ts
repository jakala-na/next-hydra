import {
  PaymentAttemptReference,
  PaymentReference,
  PreparedPaymentReference,
} from "@repo/payments";
import { describe, expect, it } from "vitest";

import { CartId, LineItemId, ProductId, VariantId } from "../domain/cart";
import { CartSnapshotVersion } from "../domain/cart-snapshot";
import type { CurrentCartState } from "../domain/cart-snapshot";
import { CountryCode } from "../domain/checkout";
import {
  DeliveryGroupReference,
  DeliveryPlanQuoteReference,
  DeliveryPlanReference,
  ShippingOptionReference,
} from "../domain/delivery-plan";
import { money } from "../domain/money";
import { StoreKey } from "../store";
import type { CartPublicStateEncoded } from "./public-state";
import { cartPublicStateIdentity, toCartPublicState } from "./public-state";

const currentCartState = (): CurrentCartState => ({
  cart: {
    checkoutDetails: {},
    id: CartId.make("cart-1"),
    lineItems: [
      {
        id: LineItemId.make("line-1"),
        quantity: 2,
        unitPrice: money(1000, "USD"),
        variant: {
          id: VariantId.make("variant-1"),
          images: [],
          name: "Hydra Wrench",
          productId: ProductId.make("product-1"),
        },
      },
    ],
    status: "active",
    storeKey: StoreKey.make("default-store"),
    totalLineItemQuantity: 2,
    totalPrice: money(2000, "USD"),
    version: CartSnapshotVersion.make("cart-1"),
  },
  violations: [],
});

describe(toCartPublicState, () => {
  it("projects line and summary Money in minor currency units", () => {
    const projected = toCartPublicState(currentCartState());

    expect(projected.cart.lineItems[0]).toMatchObject({
      lineTotal: { centAmount: 2000, currencyCode: "USD" },
      name: "Hydra Wrench",
      unitPrice: { centAmount: 1000, currencyCode: "USD" },
    });
    expect(projected.cart.summary).toStrictEqual({
      subtotal: { centAmount: 2000, currencyCode: "USD" },
      total: { centAmount: 2000, currencyCode: "USD" },
    });
  });

  it("extracts saved Shipping Option Money into the Cart summary", () => {
    const base = currentCartState();
    const state: CurrentCartState = {
      ...base,
      cart: {
        ...base.cart,
        checkoutDetails: {
          selectedDeliveryPlan: {
            groups: [
              {
                reference: DeliveryGroupReference.make("delivery-1"),
                selectedShippingOption: {
                  name: "Standard",
                  price: money(500, "USD"),
                  reference: ShippingOptionReference.make("shipping-1"),
                },
                shippingAddress: {
                  addressLine1: "1 Hydra Way",
                  city: "New York",
                  country: CountryCode.make("US"),
                  postalCode: "10001",
                },
                targets: [
                  { lineItemId: LineItemId.make("line-1"), quantity: 2 },
                ],
              },
            ],
            quoteReference: DeliveryPlanQuoteReference.make("quote-1"),
            reference: DeliveryPlanReference.make("plan-1"),
          },
        },
      },
    };

    expect(toCartPublicState(state).cart.summary.shipping).toStrictEqual({
      centAmount: 500,
      currencyCode: "USD",
    });
  });

  it("does not expose Checkout or private Payment details in the Cart read model", () => {
    const base = currentCartState();
    const preparedPayment = {
      amount: { centAmount: 2000, currencyCode: "USD" },
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
      ...base,
      cart: {
        ...base.cart,
        checkoutDetails: { preparedPayment },
      },
    };

    const serialized = JSON.stringify(toCartPublicState(state));

    expect(serialized).not.toContain("checkoutDetails");
    expect(serialized).not.toContain(preparedPayment.attemptReference);
    expect(serialized).not.toContain(preparedPayment.paymentReference);
    expect(serialized).not.toContain(preparedPayment.preparationReference);
  });

  it("identifies public Cart state by Cart ID and provider-native version", () => {
    const state: CartPublicStateEncoded = {
      cart: {
        id: "cart-1",
        lineItems: [],
        status: "active",
        storeKey: "default-store",
        summary: {
          subtotal: { centAmount: 0, currencyCode: "USD" },
          total: { centAmount: 0, currencyCode: "USD" },
        },
        totalLineItemQuantity: 0,
        version: 8,
      },
      violations: [],
    };
    const identity = cartPublicStateIdentity(state);

    expect(cartPublicStateIdentity({ ...state })).toBe(identity);
    expect(
      cartPublicStateIdentity({
        ...state,
        cart: { ...state.cart, version: 9 },
      })
    ).not.toBe(identity);
    expect(
      cartPublicStateIdentity({
        ...state,
        cart: { ...state.cart, id: "cart-2" },
      })
    ).not.toBe(identity);
    expect(cartPublicStateIdentity(null)).not.toBe(identity);
  });
});
