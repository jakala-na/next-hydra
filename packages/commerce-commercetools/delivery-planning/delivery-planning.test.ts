import type {
  ByProjectKeyRequestBuilder,
  ShippingMethod,
  ShippingRate,
} from "@commercetools/platform-sdk";
import { describe, expect, it } from "@effect/vitest";
import {
  CartId,
  LineItemId,
  ProductId,
  VariantId,
} from "@repo/commerce/domain/cart";
import type { CartSnapshot } from "@repo/commerce/domain/cart-snapshot";
import { CountryCode } from "@repo/commerce/domain/checkout";
import { DeliveryPlanning } from "@repo/commerce/services/delivery-planning";
import { CommerceLocale, StoreKey } from "@repo/commerce/store";
import { Effect, Layer } from "effect";

import { CommercetoolsRestClient } from "../client/rest-client";
import { deliveryPlanningLayer } from "./delivery-planning";

const cart: CartSnapshot = {
  checkoutDetails: {
    deliveryDetails: {
      shippingAddress: {
        addressLine1: "1 Hydra Way",
        city: "New York",
        country: CountryCode.make("US"),
        postalCode: "10001",
      },
      source: "manual",
    },
  },
  id: CartId.make("cart-1"),
  lineItems: [
    {
      id: LineItemId.make("line-1"),
      quantity: 1,
      totalPrice: { centAmount: 9500, currencyCode: "USD" },
      unitPrice: { centAmount: 9500, currencyCode: "USD" },
      variant: {
        attributes: {},
        id: VariantId.make("variant-1"),
        images: [],
        name: "Hydra Wrench",
        productId: ProductId.make("product-1"),
      },
    },
  ],
  status: "active",
  storeKey: StoreKey.make("us-store"),
  totalLineItemQuantity: 1,
  // Commercetools Cart.totalPrice includes the currently selected 1,000-cent Shipping Rate.
  totalPrice: { centAmount: 10_500, currencyCode: "USD" },
};

const quoteWithRate = (rate: ShippingRate) => {
  // SAFETY: Delivery Planning consumes only these Shipping Method fields from the matching-location response.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion, anti-slop/no-chained-type-assertions
  const method = {
    id: "shipping-method-1",
    name: "Standard",
    zoneRates: [{ shippingRates: [{ ...rate, isMatching: true }] }],
  } as unknown as ShippingMethod;
  const execute = async () =>
    await Promise.resolve({ body: { results: [method] } });
  // SAFETY: This fake implements the complete REST path exercised by Delivery Planning.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion, anti-slop/no-chained-type-assertions
  const apiRoot = {
    shippingMethods: () => ({
      matchingCartLocation: () => ({
        get: () => ({ execute }),
      }),
    }),
  } as unknown as ByProjectKeyRequestBuilder;
  const layer = deliveryPlanningLayer.pipe(
    Layer.provide(CommercetoolsRestClient.testLayer(apiRoot))
  );

  return DeliveryPlanning.quote({
    cart,
    locale: CommerceLocale.make("en-US"),
  }).pipe(Effect.provide(layer));
};

describe("Commercetools Delivery Planning", () => {
  it.effect("excludes Shipping from the freeAbove Cart Value", () =>
    Effect.gen(function* () {
      const quote = yield* quoteWithRate({
        freeAbove: {
          centAmount: 10_000,
          currencyCode: "USD",
          fractionDigits: 2,
          type: "centPrecision",
        },
        price: {
          centAmount: 1000,
          currencyCode: "USD",
          fractionDigits: 2,
          type: "centPrecision",
        },
        tiers: [],
      });

      expect(
        quote.plans[0]?.groups[0]?.shippingOptions[0]?.price
      ).toStrictEqual({ centAmount: 1000, currencyCode: "USD" });
    })
  );

  it.effect("excludes Shipping from Cart Value tier selection", () =>
    Effect.gen(function* () {
      const quote = yield* quoteWithRate({
        price: {
          centAmount: 1000,
          currencyCode: "USD",
          fractionDigits: 2,
          type: "centPrecision",
        },
        tiers: [
          {
            minimumCentAmount: 10_000,
            price: {
              centAmount: 500,
              currencyCode: "USD",
              fractionDigits: 2,
              type: "centPrecision",
            },
            type: "CartValue",
          },
        ],
      });

      expect(
        quote.plans[0]?.groups[0]?.shippingOptions[0]?.price
      ).toStrictEqual({ centAmount: 1000, currencyCode: "USD" });
    })
  );
});
