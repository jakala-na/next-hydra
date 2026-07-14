import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import {
  CartId,
  LineItemId,
  ProductId,
  Sku,
  VariantId,
} from "../../domain/cart";
import { CountryCode } from "../../domain/checkout";
import { CheckoutPolicies, type CheckoutPolicy } from "./checkout-policy";

const shippingRegionPolicy: CheckoutPolicy = {
  name: "shipping-region",
  evaluate: ({ cart, details, buyerContext }) => {
    const address = details.deliveryDetails?.shippingAddress;

    if (
      address?.region !== "Alaska" ||
      details.contact?.buyerContact.email !== "ada@example.com" ||
      buyerContext.buyerMode !== "guest"
    ) {
      return [];
    }

    return [
      {
        code: "shipping.region.unsupported",
        message: "Shipping to Alaska is unsupported for guest checkout",
        targets: cart.lineItems.map((lineItem) => ({
          type: "cartItem" as const,
          lineItemId: lineItem.id,
          productId: lineItem.productId,
          ...(lineItem.variant === undefined
            ? {}
            : {
                variantId: lineItem.variant.id,
                ...(lineItem.variant.sku === undefined
                  ? {}
                  : { sku: lineItem.variant.sku }),
              }),
        })),
      },
    ];
  },
};

const checkoutCart = {
  id: CartId.make("cart-1"),
  version: 7,
  lineItems: [
    {
      id: LineItemId.make("line-1"),
      productId: ProductId.make("product-1"),
      name: "Hydra Wrench",
      quantity: 1,
      totalPrice: { centAmount: 2500, currencyCode: "USD" },
      variant: {
        id: VariantId.make("1"),
        sku: Sku.make("HYDRA-WRENCH"),
      },
    },
  ],
  totalLineItemQuantity: 1,
  totalPrice: { centAmount: 2500, currencyCode: "USD" },
};

describe("CheckoutPolicies", () => {
  it.effect(
    "evaluates policies with Cart, saved Contact, Delivery Details, and buyer context",
    () =>
      Effect.gen(function* () {
        const policies = yield* CheckoutPolicies;
        const violations = yield* policies.evaluate({
          cart: checkoutCart,
          details: {
            contact: {
              source: "manual",
              buyerContact: {
                email: "ada@example.com",
                firstName: "Ada",
                lastName: "Lovelace",
              },
            },
            deliveryDetails: {
              source: "manual",
              shippingAddress: {
                addressLine1: "123 Analytical Engine Way",
                postalCode: "99501",
                city: "Anchorage",
                country: CountryCode.make("US"),
                region: "Alaska",
              },
            },
          },
          buyerContext: {
            buyerMode: "guest",
            requiresBuyingContext: false,
          },
        });

        expect(violations).toMatchObject([
          {
            code: "shipping.region.unsupported",
            message: "Shipping to Alaska is unsupported for guest checkout",
            targets: [
              {
                type: "cartItem",
                lineItemId: "line-1",
                productId: "product-1",
              },
            ],
          },
        ]);
      }).pipe(
        Effect.provide(CheckoutPolicies.layerFrom([shippingRegionPolicy]))
      )
  );

  it.effect(
    "returns no violations when no Checkout Policies are configured",
    () =>
      Effect.gen(function* () {
        const policies = yield* CheckoutPolicies;
        const violations = yield* policies.evaluate({
          cart: checkoutCart,
          details: {},
          buyerContext: {
            buyerMode: "guest",
            requiresBuyingContext: false,
          },
        });

        expect(violations).toEqual([]);
      }).pipe(Effect.provide(CheckoutPolicies.layerEmpty))
  );

  it.effect("blocks Shipping Options when Delivery Details use Réunion", () =>
    Effect.gen(function* () {
      const policies = yield* CheckoutPolicies;
      const violations = yield* policies.evaluate({
        cart: checkoutCart,
        details: {
          deliveryDetails: {
            source: "manual",
            shippingAddress: {
              addressLine1: "1 Rue de Paris",
              postalCode: "97400",
              city: "Saint-Denis",
              country: CountryCode.make("RE"),
            },
          },
        },
        buyerContext: {
          buyerMode: "guest",
          requiresBuyingContext: false,
        },
      });

      expect(violations).toEqual([
        {
          code: "shipping.country.unavailable",
          message: "Shipping country RE is configured as unavailable",
          parameters: { country: "RE" },
          targets: [{ type: "checkoutStep", step: "shippingOptions" }],
        },
      ]);
    }).pipe(Effect.provide(CheckoutPolicies.layer))
  );

  it.effect(
    "allows a structurally valid country that is available for shipping",
    () =>
      Effect.gen(function* () {
        const policies = yield* CheckoutPolicies;
        const violations = yield* policies.evaluate({
          cart: checkoutCart,
          details: {
            deliveryDetails: {
              source: "manual",
              shippingAddress: {
                addressLine1: "123 Analytical Engine Way",
                postalCode: "SW1A 1AA",
                city: "London",
                country: CountryCode.make("GB"),
              },
            },
          },
          buyerContext: {
            buyerMode: "guest",
            requiresBuyingContext: false,
          },
        });

        expect(violations).toEqual([]);
      }).pipe(Effect.provide(CheckoutPolicies.layer))
  );
});
