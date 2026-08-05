import { type Context, Effect, Layer, Option, Schema } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CartProviderFailure } from "../domain/cart-errors";
import { CurrentCartState } from "../domain/cart-snapshot";
import { CurrentCart } from "../services/current-cart";
import { addToCart, changeCartItemsQuantity, removeCartItem } from "./actions";
import { CommerceCartProvider } from "./cart-provider";

const { connection, getLocale, requestLayer } = vi.hoisted(() => ({
  connection: vi.fn(async () => undefined),
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
vi.mock("next/server", () => ({ connection }));

const cartState = Schema.decodeUnknownSync(CurrentCartState)({
  cart: {
    checkoutDetails: {},
    id: "cart-1",
    lineItems: [],
    status: "active",
    storeKey: "default-store",
    totalLineItemQuantity: 0,
    totalPrice: { centAmount: 0, currencyCode: "USD" },
  },
  violations: [],
});

type CurrentCartService = Context.Service.Shape<typeof CurrentCart>;

const currentCartLayer = (overrides: Partial<CurrentCartService> = {}) =>
  Layer.succeed(CurrentCart, {
    addItem: () => Effect.succeed(cartState),
    get: () => Effect.succeed(Option.some(cartState)),
    removeLineItem: () => Effect.succeed(cartState),
    saveContact: () => Effect.die("not used"),
    saveDeliveryDetails: () => Effect.die("not used"),
    setLineItemQuantity: () => Effect.succeed(cartState),
    ...overrides,
  });

beforeEach(() => {
  connection.mockClear();
  getLocale.mockClear();
  requestLayer.mockReset();
  requestLayer.mockImplementation(async () => currentCartLayer());
});

describe("Cart boundaries", () => {
  it("runs each Cart mutation with fresh request state", async () => {
    const added = await addToCart({
      productId: "product-1",
      quantity: 1,
      variantId: "variant-1",
    });
    const changed = await changeCartItemsQuantity({
      lineItemId: "line-item-1",
      quantity: 1,
    });
    const removed = await removeCartItem({ lineItemId: "line-item-1" });

    expect(requestLayer).toHaveBeenCalledTimes(CART_MUTATION_COUNT);
    expect(added).toEqual({ success: cartState });
    expect(changed).toEqual({ success: cartState });
    expect(removed).toEqual({ success: cartState });
  });

  it("returns invalid action input as a typed failure", async () => {
    await expect(
      addToCart({
        productId: "product-1",
        quantity: 0,
        variantId: "variant-1",
      })
    ).resolves.toEqual({
      error: {
        _tag: "CartActionInvalidInput",
        operation: "addItem",
      },
    });
  });

  it("removes internal causes from action failures", async () => {
    requestLayer.mockResolvedValueOnce(
      currentCartLayer({
        addItem: () =>
          Effect.fail(
            new CartProviderFailure({
              cause: new Error("provider credentials leaked"),
              operation: "addItem",
              reason: "unavailable",
            })
          ),
      })
    );

    await expect(
      addToCart({
        productId: "product-1",
        quantity: 1,
        variantId: "variant-1",
      })
    ).resolves.toEqual({
      error: {
        _tag: "CartProviderFailure",
        operation: "addItem",
        reason: "unavailable",
      },
    });
  });

  it("lets defects reject the Server Action", async () => {
    requestLayer.mockResolvedValueOnce(
      currentCartLayer({
        addItem: () => Effect.die(new Error("unexpected cart defect")),
      })
    );

    await expect(
      addToCart({
        productId: "product-1",
        quantity: 1,
        variantId: "variant-1",
      })
    ).rejects.toThrow("unexpected cart defect");
  });

  it("loads Current Cart and supplies the package actions to CartProvider", async () => {
    const element = CommerceCartProvider({
      children: <main>Storefront</main>,
      locale: "en-US",
    });

    expect(element.props.actions).toEqual({
      addToCart,
      changeCartItemsQuantity,
      removeCartItem,
    });
    await expect(element.props.cartPromise).resolves.toEqual(cartState);
    expect(connection).toHaveBeenCalledOnce();
    expect(requestLayer).toHaveBeenCalledOnce();
  });
});
