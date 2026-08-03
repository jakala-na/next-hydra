import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { CartId, LineItemId, ProductId, VariantId } from "../../domain/cart";
import type { CartSnapshot } from "../../domain/cart-snapshot";
import { StorefrontAnonymousCheckoutScope } from "../../domain/checkout";
import { CommerceLocale, StoreKey } from "../../store";
import { buildCheckoutState } from "./state";

const cart: CartSnapshot = {
  id: CartId.make("cart-1"),
  status: "active",
  storeKey: StoreKey.make("default-store"),
  lineItems: [
    {
      id: LineItemId.make("line-1"),
      variant: {
        id: VariantId.make("variant-1"),
        productId: ProductId.make("product-1"),
        name: "Hydra Wrench",
        images: [],
        attributes: {},
      },
      quantity: 1,
      unitPrice: { centAmount: 2500, currencyCode: "USD" },
      totalPrice: { centAmount: 2500, currencyCode: "USD" },
    },
  ],
  totalLineItemQuantity: 1,
  totalPrice: { centAmount: 2500, currencyCode: "USD" },
  checkoutDetails: {},
};

const scope = new StorefrontAnonymousCheckoutScope({
  channel: "storefrontAnonymous",
  locale: CommerceLocale.make("en-US"),
  anonymousCartId: cart.id,
});

describe("buildCheckoutState", () => {
  it.effect("builds steps and preserves provider-neutral policy targets", () =>
    Effect.gen(function* () {
      const state = yield* buildCheckoutState({
        scope,
        cart,
        details: {},
        buyerContext: { buyerMode: "guest", requiresBuyingContext: false },
        cartPolicyViolations: [
          {
            code: "cart.quantity.maximum",
            parameters: { maximum: 50 },
            targets: [{ type: "cart" }],
          },
        ],
        checkoutPolicyViolations: [],
      });
      expect(state.activeStep).toBe("contact");
      expect(state.violations).toEqual([
        {
          source: "cartPolicy",
          severity: "blocking",
          code: "cart.quantity.maximum",
          parameters: { maximum: 50 },
          targets: [{ type: "cart" }],
        },
      ]);
    })
  );

  it.effect("rejects an empty cart", () =>
    Effect.flip(
      buildCheckoutState({
        scope,
        cart: { ...cart, lineItems: [], totalLineItemQuantity: 0 },
        details: {},
        buyerContext: { buyerMode: "guest", requiresBuyingContext: false },
        cartPolicyViolations: [],
        checkoutPolicyViolations: [],
      })
    ).pipe(Effect.map((error) => expect(error.reason).toBe("emptyCart")))
  );
});
