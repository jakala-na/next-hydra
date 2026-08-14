import { type Context, Effect, Layer, Option, Schema } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CartProviderFailure } from "../domain/cart-errors";
import { CurrentCartState } from "../domain/cart-snapshot";
import { CurrentCart } from "../services/current-cart";
import { addToCart, changeCartItemsQuantity, removeCartItem } from "./actions";
import { CommerceCartProvider } from "./cart-provider";

const boundary = vi.hoisted(() => {
  const getLocale = vi.fn(async () => "en-US" as const);
  const provide = vi.fn();
  const runPromise = vi.fn();

  return {
    build: vi.fn((handler, options) => async (...args: unknown[]) => {
      const locale = await getLocale();
      const effect = provide(locale)(handler(...args));
      return runPromise(
        options?.transform === undefined ? effect : options.transform(effect)
      );
    }),
    connection: vi.fn(async () => undefined),
    getLocale,
    provide,
    runPromise,
  };
});

const CART_MUTATION_COUNT = 3;

vi.mock("server-only", () => ({}));
vi.mock("@repo/i18n", () => ({ getLocale: boundary.getLocale }));
vi.mock(
  "@repo/design-system/components/commerce/providers/cart-context",
  () => ({ CartProvider: () => null })
);
vi.mock("@repo/commerce/runtime", () => ({
  NextCommerce: {
    build: boundary.build,
    provide: boundary.provide,
    runPromise: boundary.runPromise,
  },
}));
vi.mock("next/server", () => ({ connection: boundary.connection }));

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
  boundary.connection.mockClear();
  boundary.getLocale.mockClear();
  boundary.provide.mockReset();
  boundary.provide.mockImplementation(
    (_locale) => (program: Effect.Effect<unknown, unknown, CurrentCart>) =>
      program.pipe(Effect.provide(currentCartLayer()))
  );
  boundary.runPromise.mockReset();
  boundary.runPromise.mockImplementation(Effect.runPromise);
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

    expect(boundary.provide).toHaveBeenCalledTimes(CART_MUTATION_COUNT);
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
    boundary.provide.mockImplementationOnce(
      (_locale) => (program: Effect.Effect<unknown, unknown, CurrentCart>) =>
        program.pipe(
          Effect.provide(
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
          )
        )
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
    boundary.provide.mockImplementationOnce(
      (_locale) => (program: Effect.Effect<unknown, unknown, CurrentCart>) =>
        program.pipe(
          Effect.provide(
            currentCartLayer({
              addItem: () => Effect.die(new Error("unexpected cart defect")),
            })
          )
        )
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
    expect(boundary.connection).toHaveBeenCalledOnce();
    expect(boundary.provide).toHaveBeenCalledOnce();
  });
});
