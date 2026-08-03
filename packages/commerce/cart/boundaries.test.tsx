import { Effect, Layer, Option, Schema } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CurrentCartState } from "../domain/cart-snapshot";
import { CurrentCart } from "../services/current-cart";
import { addToCart, changeCartItemsQuantity, removeCartItem } from "./actions";
import { CommerceCartProvider } from "./cart-provider";

const { getLocale, requestLayer } = vi.hoisted(() => ({
  getLocale: vi.fn(async () => "en-US" as const),
  requestLayer: vi.fn(),
}));

const CART_MUTATION_COUNT = 3;

vi.mock("server-only", () => ({}));
vi.mock("@repo/i18n", () => ({ getLocale }));
vi.mock(
  "@repo/design-system/components/commerce/providers/cart-context",
  () => ({ CartProvider: () => null })
);
vi.mock("../commerce-context/request", () => ({
  commerceRequestLayer: requestLayer,
}));

const cartState = Schema.decodeUnknownSync(CurrentCartState)({
  cart: {
    id: "cart-1",
    status: "active",
    storeKey: "default-store",
    lineItems: [],
    totalLineItemQuantity: 0,
    totalPrice: { centAmount: 0, currencyCode: "USD" },
    checkoutDetails: {},
  },
  violations: [],
});

const currentCartLayer = () =>
  Layer.succeed(CurrentCart, {
    get: () => Effect.succeed(Option.some(cartState)),
    addItem: () => Effect.succeed(cartState),
    setLineItemQuantity: () => Effect.succeed(cartState),
    removeLineItem: () => Effect.succeed(cartState),
    saveContact: () => Effect.die("not used"),
    saveDeliveryDetails: () => Effect.die("not used"),
  });

beforeEach(() => {
  getLocale.mockClear();
  requestLayer.mockReset();
  requestLayer.mockImplementation(async () => currentCartLayer());
});

describe("Cart boundaries", () => {
  it("runs each Cart mutation with fresh request state", async () => {
    const added = await addToCart({
      productId: "product-1",
      variantId: "variant-1",
      quantity: 1,
    });
    const changed = await changeCartItemsQuantity({
      lineItemId: "line-item-1",
      quantity: 1,
    });
    const removed = await removeCartItem({ lineItemId: "line-item-1" });

    expect(requestLayer).toHaveBeenCalledTimes(CART_MUTATION_COUNT);
    expect(added.data).toEqual({ ok: true, data: cartState });
    expect(changed.data).toEqual({ ok: true, data: cartState });
    expect(removed.data).toEqual({ ok: true, data: cartState });
  });

  it("loads Current Cart and supplies the package actions to CartProvider", async () => {
    const element = CommerceCartProvider({
      locale: "en-US",
      children: <main>Storefront</main>,
    });

    expect(element.props.actions).toEqual({
      addToCart,
      changeCartItemsQuantity,
      removeCartItem,
    });
    await expect(element.props.cartPromise).resolves.toEqual({
      ok: true,
      data: cartState,
    });
    expect(requestLayer).toHaveBeenCalledOnce();
  });
});
