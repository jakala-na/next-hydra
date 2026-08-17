import { ActionClient, ActionMiddleware, actionToEffect } from "@repo/actions";
import { InputInvalid } from "@repo/errors";
import {
  type Context,
  Effect,
  Layer,
  ManagedRuntime,
  Option,
  Schema,
} from "effect";
import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";

import { CartProviderFailure } from "../domain/cart-errors";
import { CurrentCartState } from "../domain/cart-snapshot";
import { CommerceRequestContextNotFound } from "../domain/commerce-request-context";
import { CurrentCart } from "../services/current-cart";
import type { AddToCartActionFailure } from "./action-result";
import { CommerceCartProvider } from "./cart-provider";
import { makeCartProcedures } from "./procedures";

const boundary = vi.hoisted(() => {
  const getLocale = vi.fn(async () => "en-US" as const);
  const provide = vi.fn();
  const requestLayer =
    vi.fn<
      (
        _locale: "en-US"
      ) => Layer.Layer<CurrentCart, CommerceRequestContextNotFound>
    >();
  const runPromise = vi.fn();

  return {
    connection: vi.fn(async () => undefined),
    getLocale,
    provide,
    requestLayer,
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
vi.mock("@repo/commerce/runtime", async () => {
  return {
    NextCommerce: {
      provide: boundary.provide,
      runPromise: boundary.runPromise,
    },
  };
});
vi.mock("next/server", () => ({ connection: boundary.connection }));

const TestCommerceActions = ActionClient.make(ManagedRuntime.make(Layer.empty))
  .use(
    ActionMiddleware.context(() =>
      Effect.promise(boundary.getLocale).pipe(
        Effect.map((locale) => ({ locale }))
      )
    )
  )
  .provide(({ locale }: { readonly locale: "en-US" }) =>
    Layer.unwrap(Effect.sync(() => boundary.requestLayer(locale)))
  );
const {
  addToCartProcedure,
  changeCartItemsQuantityProcedure,
  removeCartItemProcedure,
} = makeCartProcedures(TestCommerceActions);
const addToCart = addToCartProcedure.toAction();
const changeCartItemsQuantity = changeCartItemsQuantityProcedure.toAction();
const removeCartItem = removeCartItemProcedure.toAction();
const cartActions = { addToCart, changeCartItemsQuantity, removeCartItem };

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
  boundary.requestLayer.mockReset();
  boundary.requestLayer.mockImplementation(() => currentCartLayer());
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

    expect(boundary.requestLayer).toHaveBeenCalledTimes(CART_MUTATION_COUNT);
    expect(added).toEqual({ _tag: "Success", success: cartState });
    expect(changed).toEqual({ _tag: "Success", success: cartState });
    expect(removed).toEqual({ _tag: "Success", success: cartState });
  });

  it("returns invalid action input as a typed failure", async () => {
    await expect(
      addToCart({
        productId: "product-1",
        quantity: 0,
        variantId: "variant-1",
      })
    ).resolves.toEqual({
      _tag: "Failure",
      failure: {
        _tag: "InputInvalid",
        category: "bad_input",
        code: "input.invalid",
        issues: [
          {
            path: ["quantity"],
            message: "Invalid input.",
          },
        ],
        message: "Invalid input.",
        recovery: "fix_input",
      },
    });
  });

  it("reconstructs the declared Effect channels after the action boundary", async () => {
    const addToCartEffect = actionToEffect(
      addToCartProcedure.resultSchema,
      addToCart
    );

    expectTypeOf<
      Effect.Error<ReturnType<typeof addToCartEffect>>
    >().toEqualTypeOf<InputInvalid | AddToCartActionFailure>();

    await expect(
      Effect.runPromise(
        addToCartEffect({
          productId: "product-1",
          quantity: 1,
          variantId: "variant-1",
        })
      )
    ).resolves.toEqual(cartState);

    const failure = await Effect.runPromise(
      Effect.flip(
        addToCartEffect({
          productId: "product-1",
          quantity: 0,
          variantId: "variant-1",
        })
      )
    );

    expect(Schema.is(InputInvalid)(failure)).toBe(true);
    expect(failure).toMatchObject({
      _tag: "InputInvalid",
      issues: [{ path: ["quantity"], message: "Invalid input." }],
    });
  });

  it("removes internal causes from action failures", async () => {
    boundary.requestLayer.mockImplementationOnce(() =>
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
      _tag: "Failure",
      failure: {
        _tag: "CartProviderFailure",
        operation: "addItem",
        reason: "unavailable",
      },
    });
  });

  it("projects Commerce request diagnostics before serializing them", async () => {
    boundary.requestLayer.mockImplementationOnce(() =>
      Layer.effect(
        CurrentCart,
        Effect.fail(
          new CommerceRequestContextNotFound({
            message: "Commerce customer mapping does not exist for auth-user-1",
            reason: "noCustomerMapping",
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
      _tag: "Failure",
      failure: {
        _tag: "CommerceRequestContextNotFound",
        category: "not_found",
        code: "cart.contextUnavailable",
        message: "The cart is unavailable for the current account.",
        reason: "noCustomerMapping",
        recovery: "refresh",
      },
    });
  });

  it.each(["invalidData", "unexpectedResponse"] as const)(
    "lets %s provider failures reject the Server Action",
    async (reason) => {
      boundary.requestLayer.mockImplementationOnce(() =>
        currentCartLayer({
          addItem: () =>
            Effect.fail(
              new CartProviderFailure({
                operation: "addItem",
                reason,
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
      ).rejects.toMatchObject({
        _tag: "CartProviderFailure",
        reason,
      });
    }
  );

  it("lets defects reject the Server Action", async () => {
    boundary.requestLayer.mockImplementationOnce(() =>
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
      actions: cartActions,
      children: <main>Storefront</main>,
      locale: "en-US",
    });

    expect(element.props.actions).toEqual(cartActions);
    await expect(element.props.cartPromise).resolves.toEqual(cartState);
    expect(boundary.connection).toHaveBeenCalledOnce();
    expect(boundary.provide).toHaveBeenCalledOnce();
  });
});
