import { CountryCode } from "@repo/commerce/domain/address";
import { LineItemId } from "@repo/commerce/domain/cart";
import {
  DeliveryGroupReference,
  DeliveryPlanQuoteReference,
  DeliveryPlanReference,
} from "@repo/commerce/domain/delivery-plan";
import { CurrencyCode, money } from "@repo/commerce/domain/money";
import { describe, expect, it } from "vitest";

import {
  deliveryAddressKeyFor,
  shippingKeyFor,
  shippingOptionReferenceFor,
} from "../delivery-planning/references";
import type { CommercetoolsCart, CommercetoolsLineItem } from "./provider-cart";
import { buildSaveShippingOptionsActions } from "./shipping-options-actions";

const lineItem = (id: string, quantity: number): CommercetoolsLineItem => ({
  id,
  name: id,
  price: {
    discounted: null,
    value: { centAmount: 100, currencyCode: CurrencyCode.make("USD") },
  },
  productId: `product-${id}`,
  quantity,
  totalPrice: {
    centAmount: quantity * 100,
    currencyCode: CurrencyCode.make("USD"),
  },
  variant: null,
});

describe(buildSaveShippingOptionsActions, () => {
  it("materializes each delivery target as an explicit line-item quantity", () => {
    const firstGroup = DeliveryGroupReference.make("delivery-1");
    const secondGroup = DeliveryGroupReference.make("delivery-2");
    const quoteReference = DeliveryPlanQuoteReference.make("quote-1");
    const planReference = DeliveryPlanReference.make("plan-1");
    const cart = {
      itemShippingAddresses: [],
      lineItems: [lineItem("line-1", 3), lineItem("line-2", 1)],
      shipping: [],
    } satisfies Pick<
      CommercetoolsCart,
      "itemShippingAddresses" | "lineItems" | "shipping"
    >;

    const actions = buildSaveShippingOptionsActions(cart, {
      groups: [
        {
          reference: firstGroup,
          selectedShippingOption: {
            name: "Standard",
            price: money(500, CurrencyCode.make("USD")),
            reference: shippingOptionReferenceFor("standard-id"),
          },
          shippingAddress: {
            addressLine1: "1 Main Street",
            city: "Boston",
            country: CountryCode.make("US"),
            postalCode: "02108",
            region: "MA",
          },
          targets: [{ lineItemId: LineItemId.make("line-1"), quantity: 2 }],
        },
        {
          reference: secondGroup,
          selectedShippingOption: {
            name: "Express",
            price: money(1250, CurrencyCode.make("USD")),
            reference: shippingOptionReferenceFor("express-id"),
          },
          shippingAddress: {
            addressLine1: "1 Main Street",
            city: "Boston",
            country: CountryCode.make("US"),
            postalCode: "02108",
            region: "MA",
          },
          targets: [
            { lineItemId: LineItemId.make("line-1"), quantity: 1 },
            { lineItemId: LineItemId.make("line-2"), quantity: 1 },
          ],
        },
      ],
      quoteReference,
      reference: planReference,
    });

    expect(
      actions.filter((action) => action.action === "setLineItemShippingDetails")
    ).toStrictEqual([
      {
        action: "setLineItemShippingDetails",
        lineItemId: "line-1",
        shippingDetails: {
          targets: [
            {
              addressKey: deliveryAddressKeyFor(firstGroup),
              quantity: 2,
              shippingMethodKey: shippingKeyFor(
                firstGroup,
                quoteReference,
                planReference
              ),
            },
            {
              addressKey: deliveryAddressKeyFor(secondGroup),
              quantity: 1,
              shippingMethodKey: shippingKeyFor(
                secondGroup,
                quoteReference,
                planReference
              ),
            },
          ],
        },
      },
      {
        action: "setLineItemShippingDetails",
        lineItemId: "line-2",
        shippingDetails: {
          targets: [
            {
              addressKey: deliveryAddressKeyFor(secondGroup),
              quantity: 1,
              shippingMethodKey: shippingKeyFor(
                secondGroup,
                quoteReference,
                planReference
              ),
            },
          ],
        },
      },
    ]);
  });
});
