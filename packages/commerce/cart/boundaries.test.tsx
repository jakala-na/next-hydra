import { ActionClient, ActionMiddleware, actionToEffect } from "@repo/actions";
import { InputInvalid } from "@repo/errors";
import { Effect, Layer, ManagedRuntime, Option, Schema } from "effect";
import { describe, expect, expectTypeOf, it } from "vitest";

import { CartProviderFailure } from "../domain/cart-errors";
import { CurrentCartState } from "../domain/cart-snapshot";
import { CommerceRequestContextNotFound } from "../domain/commerce-request-context";
import { CurrentCart } from "../services/current-cart";
import type { AddToCartActionFailure } from "./action-result";
import { makeCartProcedures } from "./procedures";

const CART_MUTATION_COUNT = 3;

const cartState = Schema.decodeSync(CurrentCartState)({
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

type CurrentCartService = (typeof CurrentCart)["Service"];

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

const makeCartActions = (
  requestLayer: () => Layer.Layer<CurrentCart, CommerceRequestContextNotFound>
) => {
  let requestLayerCalls = 0;
  const TestCommerceActions = ActionClient.make(
    ManagedRuntime.make(Layer.empty)
  )
    .use(
      ActionMiddleware.context(() =>
        Effect.succeed({ locale: "en-US" as const })
      )
    )
    .provide((_context: { readonly locale: "en-US" }) =>
      Layer.unwrap(
        Effect.sync(() => {
          requestLayerCalls += 1;
          return requestLayer();
        })
      )
    );

  const {
    addToCartProcedure,
    changeCartItemsQuantityProcedure,
    removeCartItemProcedure,
  } = makeCartProcedures(TestCommerceActions);

  return {
    addToCart: addToCartProcedure.toAction(),
    addToCartProcedure,
    changeCartItemsQuantity: changeCartItemsQuantityProcedure.toAction(),
    removeCartItem: removeCartItemProcedure.toAction(),
    requestLayerCalls: () => requestLayerCalls,
  };
};

describe("Cart boundaries", () => {
  it("runs each Cart mutation with fresh request state", async () => {
    const actions = makeCartActions(() => currentCartLayer());

    const added = await actions.addToCart({
      productId: "product-1",
      quantity: 1,
      variantId: "variant-1",
    });
    const changed = await actions.changeCartItemsQuantity({
      lineItemId: "line-item-1",
      quantity: 1,
    });
    const removed = await actions.removeCartItem({ lineItemId: "line-item-1" });

    expect(actions.requestLayerCalls()).toBe(CART_MUTATION_COUNT);
    expect(added).toStrictEqual({ _tag: "Success", success: cartState });
    expect(changed).toStrictEqual({ _tag: "Success", success: cartState });
    expect(removed).toStrictEqual({ _tag: "Success", success: cartState });
  });

  it("returns invalid action input as a typed failure", async () => {
    const { addToCart } = makeCartActions(() => currentCartLayer());

    await expect(
      addToCart({
        productId: "product-1",
        quantity: 0,
        variantId: "variant-1",
      })
    ).resolves.toStrictEqual({
      _tag: "Failure",
      failure: {
        _tag: "InputInvalid",
        category: "bad_input",
        code: "input.invalid",
        issues: [
          {
            message: "Invalid input.",
            path: ["quantity"],
          },
        ],
        message: "Invalid input.",
        recovery: "fix_input",
      },
    });
  });

  it("reconstructs the declared Effect channels after the action boundary", async () => {
    const { addToCart, addToCartProcedure } = makeCartActions(() =>
      currentCartLayer()
    );
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
    ).resolves.toStrictEqual(cartState);

    const failure = await Effect.runPromise(
      Effect.flip(
        addToCartEffect({
          productId: "product-1",
          quantity: 0,
          variantId: "variant-1",
        })
      )
    );

    expect(Schema.is(InputInvalid)(failure)).toBeTruthy();
    expect(failure).toMatchObject({
      _tag: "InputInvalid",
      issues: [{ message: "Invalid input.", path: ["quantity"] }],
    });
  });

  it("removes internal causes from action failures", async () => {
    const { addToCart } = makeCartActions(() =>
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
    ).resolves.toStrictEqual({
      _tag: "Failure",
      failure: {
        _tag: "CartProviderFailure",
        operation: "addItem",
        reason: "unavailable",
      },
    });
  });

  it("projects Commerce request diagnostics before serializing them", async () => {
    const { addToCart } = makeCartActions(() =>
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
    ).resolves.toStrictEqual({
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
      const providerFailure = new CartProviderFailure({
        operation: "addItem",
        reason,
      });
      const { addToCart } = makeCartActions(() =>
        currentCartLayer({
          addItem: () => Effect.fail(providerFailure),
        })
      );
      const submission = addToCart({
        productId: "product-1",
        quantity: 1,
        variantId: "variant-1",
      });

      await expect(submission).rejects.toBeInstanceOf(Error);
      await expect(submission).rejects.toMatchObject({
        cause: providerFailure,
        message: "Action CartAction.addToCart failed.",
        name: "CartProviderFailure",
      });
    }
  );

  it("lets defects reject the Server Action", async () => {
    const { addToCart } = makeCartActions(() =>
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
});
