import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { AddressBookReference } from "../../domain/address-book";
import {
  AnonymousId,
  CartId,
  LineItemId,
  ProductId,
  Sku,
  VariantId,
} from "../../domain/cart";
import {
  type CheckoutBuyerContext,
  CheckoutLocale,
  CheckoutUnavailable,
  CountryCode,
  StorefrontAnonymousCheckoutScope,
} from "../../domain/checkout";
import { buildCheckoutState } from "./state";

const money = {
  centAmount: 2500,
  currencyCode: "USD",
} as const;

type TestLineItem = {
  id: LineItemId;
  productId: ProductId;
  name: string;
  quantity: number;
  totalPrice: typeof money;
  variant: {
    id: VariantId;
    sku: Sku;
  };
};

const defaultLineItems: TestLineItem[] = [
  {
    id: LineItemId.make("line-1"),
    productId: ProductId.make("product-1"),
    name: "Hydra Wrench",
    quantity: 1,
    totalPrice: money,
    variant: {
      id: VariantId.make("1"),
      sku: Sku.make("HYDRA-WRENCH"),
    },
  },
];

const cart = ({
  lineItems,
  totalLineItemQuantity,
}: {
  readonly lineItems?: TestLineItem[];
  readonly totalLineItemQuantity?: number;
} = {}) => {
  const resolvedLineItems = lineItems ?? defaultLineItems;

  return {
    id: CartId.make("cart-1"),
    version: 7,
    anonymousId: AnonymousId.make("anon-1"),
    lineItems: resolvedLineItems,
    totalLineItemQuantity:
      totalLineItemQuantity ??
      resolvedLineItems.reduce(
        (total, lineItem) => total + lineItem.quantity,
        0
      ),
    totalPrice: money,
  };
};

const scope = new StorefrontAnonymousCheckoutScope({
  channel: "storefrontAnonymous",
  locale: CheckoutLocale.make("en-US"),
  anonymousCartId: CartId.make("cart-1"),
});

const guestBuyerContext: CheckoutBuyerContext = {
  buyerMode: "guest",
  requiresBuyingContext: false,
};

describe("buildCheckoutState", () => {
  it.effect("rejects an empty Cart before checkout can start", () =>
    Effect.gen(function* () {
      const error = yield* buildCheckoutState({
        scope,
        cart: cart({ lineItems: [], totalLineItemQuantity: 0 }),
        details: {},
        buyerContext: guestBuyerContext,
        cartPolicyViolations: [],
        checkoutPolicyViolations: [],
      }).pipe(Effect.flip);

      expect(error).toBeInstanceOf(CheckoutUnavailable);
      expect(error.reason).toBe("emptyCart");
    })
  );

  it.effect(
    "computes binary step status and active step from resolved details",
    () =>
      Effect.gen(function* () {
        const state = yield* buildCheckoutState({
          scope,
          cart: cart(),
          details: {
            contact: {
              source: "manual",
              buyerContact: {
                email: "ada@example.com",
                firstName: "Ada",
                lastName: "Lovelace",
              },
            },
          },
          buyerContext: guestBuyerContext,
          cartPolicyViolations: [],
          checkoutPolicyViolations: [],
        });

        expect(state.steps.map((step) => [step.id, step.status])).toEqual([
          ["contact", "complete"],
          ["deliveryDetails", "incomplete"],
          ["shippingOptions", "incomplete"],
          ["paymentOptions", "incomplete"],
          ["reviewOrder", "incomplete"],
        ]);
        expect(state.activeStep).toBe("deliveryDetails");
      })
  );

  it.effect(
    "returns the current Address Book reference without option data",
    () =>
      Effect.gen(function* () {
        const state = yield* buildCheckoutState({
          scope,
          cart: cart(),
          details: {
            deliveryDetails: {
              source: "addressBook",
              addressBookReference: AddressBookReference.make("london-office"),
              shippingAddress: {
                addressLine1: "123 Analytical Engine Way",
                postalCode: "SW1A 1AA",
                city: "London",
                country: CountryCode.make("GB"),
              },
            },
          },
          buyerContext: guestBuyerContext,
          cartPolicyViolations: [],
          checkoutPolicyViolations: [],
        });

        expect(state.details.deliveryDetails).toMatchObject({
          source: "addressBook",
          addressBookReference: "london-office",
        });
        expect(state).not.toHaveProperty("addressBookEntries");
      })
  );

  it.effect(
    "normalizes Cart Policy and Checkout Policy violations into Checkout State",
    () =>
      Effect.gen(function* () {
        const state = yield* buildCheckoutState({
          scope,
          cart: cart(),
          details: {},
          buyerContext: guestBuyerContext,
          cartPolicyViolations: [
            {
              policyName: "guest-max-limits",
              violationType: "MAX_GUEST_TOTAL_ITEMS_EXCEEDED",
              message: "Guest carts are limited to 50 total items.",
              metadata: {
                maxQuantity: 50,
                excessQuantity: 1,
              },
              affectedItems: [
                {
                  productId: "product-1",
                  lineItemId: "line-1",
                  sku: "HYDRA-WRENCH",
                },
              ],
            },
            {
              policyName: "compatible-products",
              violationType: "INCOMPATIBLE_CART_ITEMS",
              message: "These Cart items cannot be purchased together.",
            },
          ],
          checkoutPolicyViolations: [
            {
              code: "SHIPPING_ADDRESS_RESTRICTED",
              message: "The shipping address is restricted",
              targets: [{ type: "checkoutStep", step: "deliveryDetails" }],
            },
            {
              code: "CHECKOUT_BLOCKED",
              message: "Checkout is blocked",
              targets: [],
            },
          ],
        });

        expect(state.violations).toMatchObject([
          {
            source: "cartPolicy",
            severity: "blocking",
            code: "MAX_GUEST_TOTAL_ITEMS_EXCEEDED",
            parameters: {
              maxQuantity: 50,
              excessQuantity: 1,
            },
            targets: [
              {
                type: "cartItem",
                lineItemId: "line-1",
                productId: "product-1",
                sku: "HYDRA-WRENCH",
              },
            ],
          },
          {
            source: "cartPolicy",
            severity: "blocking",
            code: "INCOMPATIBLE_CART_ITEMS",
            targets: [{ type: "cart" }],
          },
          {
            source: "checkoutPolicy",
            severity: "blocking",
            code: "SHIPPING_ADDRESS_RESTRICTED",
            targets: [{ type: "checkoutStep", step: "deliveryDetails" }],
          },
          {
            source: "checkoutPolicy",
            severity: "blocking",
            code: "CHECKOUT_BLOCKED",
            targets: [],
          },
        ]);
        for (const violation of state.violations) {
          expect(violation).not.toHaveProperty("message");
        }
      })
  );
});
