import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { CountryCode } from "../domain/address";
import { CartId, LineItemId, ProductId, VariantId } from "../domain/cart";
import { CartSnapshotVersion } from "../domain/cart-snapshot";
import type { CartSnapshot } from "../domain/cart-snapshot";
import {
  DeliveryGroupReference,
  DeliveryPlanReference,
  DeliveryPlanQuoteReference,
  ShippingOptionReference,
} from "../domain/delivery-plan";
import type { DeliveryPlanQuote } from "../domain/delivery-plan";
import { money } from "../domain/money";
import { StoreKey } from "../store";
import { validateDeliveryPlanQuote } from "./delivery-planning";

const cart = {
  checkoutDetails: {},
  id: CartId.make("cart-1"),
  lineItems: [
    {
      id: LineItemId.make("line-1"),
      quantity: 3,
      unitPrice: money(1000, "USD"),
      variant: {
        id: VariantId.make("1"),
        images: [],
        productId: ProductId.make("product-1"),
      },
    },
    {
      id: LineItemId.make("line-2"),
      quantity: 1,
      unitPrice: money(2000, "USD"),
      variant: {
        id: VariantId.make("2"),
        images: [],
        productId: ProductId.make("product-2"),
      },
    },
  ],
  status: "active",
  storeKey: StoreKey.make("store"),
  totalLineItemQuantity: 4,
  totalPrice: money(5000, "USD"),
  version: CartSnapshotVersion.make("cart-1"),
} as const satisfies CartSnapshot;

const shippingAddress = {
  addressLine1: "123 Test Street",
  city: "New York",
  country: CountryCode.make("US"),
  postalCode: "10001",
} as const;

const option = (reference: string, centAmount: number) => ({
  name: reference,
  price: money(centAmount, "USD"),
  reference: ShippingOptionReference.make(reference),
});

describe(validateDeliveryPlanQuote, () => {
  it.effect("accepts split groups with independent targets and prices", () => {
    const quote = {
      plans: [
        {
          groups: [
            {
              reference: DeliveryGroupReference.make("delivery-1"),
              shippingAddress,
              shippingOptions: [option("standard", 5000)],
              targets: [{ lineItemId: LineItemId.make("line-1"), quantity: 2 }],
            },
            {
              reference: DeliveryGroupReference.make("delivery-2"),
              shippingAddress,
              shippingOptions: [option("express", 9000)],
              targets: [
                { lineItemId: LineItemId.make("line-1"), quantity: 1 },
                { lineItemId: LineItemId.make("line-2"), quantity: 1 },
              ],
            },
          ],
          reference: DeliveryPlanReference.make("plan-1"),
        },
      ],
      reference: DeliveryPlanQuoteReference.make("quote-1"),
    } as const satisfies DeliveryPlanQuote;

    return Effect.gen(function* () {
      expect(yield* validateDeliveryPlanQuote(cart, quote)).toEqual(quote);
    });
  });

  it.effect(
    "rejects a plan that does not allocate every Cart Line Item quantity",
    () =>
      Effect.gen(function* () {
        const result = yield* Effect.result(
          validateDeliveryPlanQuote(cart, {
            plans: [
              {
                groups: [
                  {
                    reference: DeliveryGroupReference.make("delivery-1"),
                    shippingAddress,
                    shippingOptions: [option("standard", 5000)],
                    targets: [
                      { lineItemId: LineItemId.make("line-1"), quantity: 1 },
                    ],
                  },
                ],
                reference: DeliveryPlanReference.make("plan-1"),
              },
            ],
            reference: DeliveryPlanQuoteReference.make("quote-1"),
          } as const satisfies DeliveryPlanQuote)
        );

        expect(result).toMatchObject({
          _tag: "Failure",
          failure: {
            _tag: "InvalidDeliveryPlanQuote",
            message:
              "Delivery Targets allocate 1 of 3 units from Cart Line Item line-1",
          },
        });
      })
  );

  it.effect(
    "rejects duplicate targets for one Line Item inside a Delivery Group",
    () =>
      Effect.gen(function* () {
        const result = yield* Effect.result(
          validateDeliveryPlanQuote(cart, {
            plans: [
              {
                groups: [
                  {
                    reference: DeliveryGroupReference.make("delivery-1"),
                    shippingAddress,
                    shippingOptions: [option("standard", 5000)],
                    targets: [
                      { lineItemId: LineItemId.make("line-1"), quantity: 2 },
                      { lineItemId: LineItemId.make("line-1"), quantity: 1 },
                      { lineItemId: LineItemId.make("line-2"), quantity: 1 },
                    ],
                  },
                ],
                reference: DeliveryPlanReference.make("plan-1"),
              },
            ],
            reference: DeliveryPlanQuoteReference.make("quote-1"),
          } as const satisfies DeliveryPlanQuote)
        );

        expect(result).toMatchObject({
          _tag: "Failure",
          failure: {
            _tag: "InvalidDeliveryPlanQuote",
            message:
              "Cart Line Item line-1 appears more than once in Delivery Group delivery-1",
          },
        });
      })
  );
});
