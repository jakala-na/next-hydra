import { CartId, StoreKey } from "@repo/commerce/domain/cart";
import type { CurrentCartState } from "@repo/commerce/domain/cart-snapshot";
import { CurrentCart } from "@repo/commerce/services/current-cart";
import { Effect, Layer, Option } from "effect";
import { describe, expect, it } from "vitest";
import {
  addToCurrentCart,
  removeCurrentCartLineItem,
  setCurrentCartLineItemQuantity,
} from "./current-cart-action-programs";

const state: CurrentCartState = {
  cart: {
    id: CartId.make("cart-1"),
    status: "active",
    storeKey: StoreKey.make("us-store"),
    lineItems: [],
    totalLineItemQuantity: 0,
    totalPrice: { centAmount: 0, currencyCode: "USD" },
    checkoutDetails: {},
  },
  violations: [],
};

describe("Current Cart storefront programs", () => {
  it("calls the named Current Cart operations with buyer intent", async () => {
    const calls: unknown[] = [];
    const layer = Layer.succeed(
      CurrentCart,
      CurrentCart.of({
        get: () => Effect.succeed(Option.some(state)),
        addItem: (input) =>
          Effect.sync(() => {
            calls.push({ operation: "addItem", input });
            return state;
          }),
        setLineItemQuantity: (input) =>
          Effect.sync(() => {
            calls.push({ operation: "setLineItemQuantity", input });
            return state;
          }),
        removeLineItem: (input) =>
          Effect.sync(() => {
            calls.push({ operation: "removeLineItem", input });
            return state;
          }),
        saveContact: () => Effect.succeed(state),
        saveDeliveryDetails: () => Effect.succeed(state),
      })
    );

    await Effect.runPromise(
      Effect.gen(function* () {
        yield* addToCurrentCart({
          productId: "product-1",
          variantId: "variant-1",
          quantity: 2,
        });
        yield* setCurrentCartLineItemQuantity({
          lineItemId: "line-1",
          quantity: 3,
        });
        yield* removeCurrentCartLineItem({ lineItemId: "line-1" });

        expect(calls).toEqual([
          {
            operation: "addItem",
            input: {
              productId: "product-1",
              variantId: "variant-1",
              quantity: 2,
            },
          },
          {
            operation: "setLineItemQuantity",
            input: { lineItemId: "line-1", quantity: 3 },
          },
          {
            operation: "removeLineItem",
            input: { lineItemId: "line-1" },
          },
        ]);
      }).pipe(Effect.provide(layer))
    );
  });
});
