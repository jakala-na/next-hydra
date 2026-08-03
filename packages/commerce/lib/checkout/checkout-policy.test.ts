import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { CartId } from "../../domain/cart";
import type { CartSnapshot } from "../../domain/cart-snapshot";
import { CountryCode } from "../../domain/checkout";
import { StoreKey } from "../../store";
import {
  CheckoutPolicies,
  makeShippingCountryAvailabilityPolicy,
} from "./checkout-policy";

const cart: CartSnapshot = {
  id: CartId.make("cart-1"),
  status: "active",
  storeKey: StoreKey.make("default-store"),
  lineItems: [],
  totalLineItemQuantity: 0,
  totalPrice: { centAmount: 0, currencyCode: "USD" },
  checkoutDetails: {},
};

const buyerContext = {
  buyerMode: "guest",
  requiresBuyingContext: false,
} as const;

describe("CheckoutPolicies", () => {
  it.effect("returns a shipping violation for an unavailable country", () =>
    Effect.gen(function* () {
      const policies = yield* CheckoutPolicies;
      const violations = yield* policies.evaluate({
        cart,
        buyerContext,
        details: {
          deliveryDetails: {
            source: "manual",
            shippingAddress: {
              addressLine1: "1 Hydra Way",
              postalCode: "97400",
              city: "Saint-Denis",
              country: CountryCode.make("RE"),
            },
          },
        },
      });
      expect(violations).toMatchObject([
        {
          code: "shipping.country.unavailable",
          targets: [{ type: "checkoutStep", step: "shippingOptions" }],
        },
      ]);
    }).pipe(
      Effect.provide(
        CheckoutPolicies.layerFrom([
          makeShippingCountryAvailabilityPolicy([CountryCode.make("RE")]),
        ])
      )
    )
  );

  it.effect("returns no violation for an available country", () =>
    Effect.gen(function* () {
      const policies = yield* CheckoutPolicies;
      expect(
        yield* policies.evaluate({ cart, buyerContext, details: {} })
      ).toEqual([]);
    }).pipe(Effect.provide(CheckoutPolicies.layer))
  );
});
