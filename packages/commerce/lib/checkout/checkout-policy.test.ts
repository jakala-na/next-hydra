import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { CartId } from "../../domain/cart";
import { CartSnapshotVersion } from "../../domain/cart-snapshot";
import type { CartSnapshot } from "../../domain/cart-snapshot";
import { CountryCode } from "../../domain/checkout";
import { money } from "../../domain/money";
import { StoreKey } from "../../store";
import {
  CheckoutPolicies,
  makeShippingCountryAvailabilityPolicy,
} from "./checkout-policy";

const cart: CartSnapshot = {
  checkoutDetails: {},
  id: CartId.make("cart-1"),
  lineItems: [],
  status: "active",
  storeKey: StoreKey.make("default-store"),
  totalLineItemQuantity: 0,
  totalPrice: money(0, "USD"),
  version: CartSnapshotVersion.make("cart-1"),
};

const buyerContext = {
  buyerMode: "guest",
  requiresBuyingContext: false,
} as const;

describe(CheckoutPolicies, () => {
  it.effect("returns a shipping violation for an unavailable country", () =>
    Effect.gen(function* () {
      const policies = yield* CheckoutPolicies;
      const violations = yield* policies.evaluate({
        buyerContext,
        cart,
        details: {
          deliveryDetails: {
            shippingAddress: {
              addressLine1: "1 Hydra Way",
              city: "Saint-Denis",
              country: CountryCode.make("RE"),
              postalCode: "97400",
            },
            source: "manual",
          },
        },
      });
      expect(violations).toMatchObject([
        {
          code: "shipping.country.unavailable",
          targets: [{ step: "shippingOptions", type: "checkoutStep" }],
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
        yield* policies.evaluate({ buyerContext, cart, details: {} })
      ).toStrictEqual([]);
    }).pipe(Effect.provide(CheckoutPolicies.layer))
  );
});
