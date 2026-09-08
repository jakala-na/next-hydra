import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { CartId, LineItemId, ProductId, VariantId } from "../../domain/cart";
import type { CartSnapshot } from "../../domain/cart-snapshot";
import { StorefrontAnonymousCheckoutScope } from "../../domain/checkout";
import { CommerceLocale, StoreKey } from "../../store";
import { buildCheckoutState } from "./state";

const cart: CartSnapshot = {
  checkoutDetails: {},
  id: CartId.make("cart-1"),
  lineItems: [
    {
      id: LineItemId.make("line-1"),
      quantity: 1,
      totalPrice: { centAmount: 2500, currencyCode: "USD" },
      unitPrice: { centAmount: 2500, currencyCode: "USD" },
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
  totalLineItemQuantity: 1,
  totalPrice: { centAmount: 2500, currencyCode: "USD" },
};

const scope = new StorefrontAnonymousCheckoutScope({
  anonymousCartId: cart.id,
  channel: "storefrontAnonymous",
  locale: CommerceLocale.make("en-US"),
});

describe(buildCheckoutState, () => {
  it.effect("builds steps and preserves provider-neutral policy targets", () =>
    Effect.gen(function* () {
      const state = yield* buildCheckoutState({
        buyerContext: { buyerMode: "guest", requiresBuyingContext: false },
        cart,
        cartPolicyViolations: [
          {
            code: "cart.quantity.maximum",
            parameters: { maximum: 50 },
            targets: [{ type: "cart" }],
          },
        ],
        checkoutPolicyViolations: [],
        details: {},
        scope,
      });
      expect(state.nextStep).toBe("contact");
      expect(state.violations).toStrictEqual([
        {
          code: "cart.quantity.maximum",
          parameters: { maximum: 50 },
          severity: "blocking",
          source: "cartPolicy",
          targets: [{ type: "cart" }],
        },
      ]);
    })
  );

  it.effect("rejects an empty cart", () =>
    Effect.flip(
      buildCheckoutState({
        buyerContext: { buyerMode: "guest", requiresBuyingContext: false },
        cart: { ...cart, lineItems: [], totalLineItemQuantity: 0 },
        cartPolicyViolations: [],
        checkoutPolicyViolations: [],
        details: {},
        scope,
      })
    ).pipe(
      Effect.map((error) => {
        expect(error.reason).toBe("emptyCart");
        return error;
      })
    )
  );
});
