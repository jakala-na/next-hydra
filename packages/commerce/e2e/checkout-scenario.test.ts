/* oxlint-disable typescript/promise-function-async -- Test doubles return already-settled promises to implement asynchronous browser and cleanup ports. */
import { describe, expect, it } from "vitest";

import { CurrencyCode } from "../domain/money";
import {
  ANONYMOUS_CART_COOKIE_NAME,
  encodeAnonymousCartCookie,
  makeAnonymousCartCookie,
} from "../lib/cart/utils/anonymous-cart-cookies";
import { CommerceLocale, Store, StoreKey } from "../store";
import { CheckoutScenario } from "./checkout-scenario";

const anonymousCartCookie = (cartId: string) => ({
  name: ANONYMOUS_CART_COOKIE_NAME,
  value: encodeAnonymousCartCookie(
    makeAnonymousCartCookie({
      cartId,
      store: new Store({
        currency: CurrencyCode.make("USD"),
        locale: CommerceLocale.make("en-US"),
        storeKey: StoreKey.make("default-store"),
      }),
    })
  ),
});

describe(CheckoutScenario, () => {
  it("cleans the current anonymous Cart during teardown", async () => {
    const deletedCartIds: string[] = [];
    const scenario = new CheckoutScenario({
      deleteCart: (cartId) => {
        deletedCartIds.push(cartId);
        return Promise.resolve();
      },
      page: {
        context: () => ({
          cookies: () => Promise.resolve([anonymousCartCookie("cart-1")]),
        }),
      },
    });

    await scenario.dispose();
    await scenario.dispose();

    expect(deletedCartIds).toStrictEqual(["cart-1"]);
  });

  it("cleans a remembered Cart after its browser cookie disappears", async () => {
    const deletedCartIds: string[] = [];
    let cookies = [anonymousCartCookie("cart-1")];
    const scenario = new CheckoutScenario({
      deleteCart: (cartId) => {
        deletedCartIds.push(cartId);
        return Promise.resolve();
      },
      page: {
        context: () => ({ cookies: () => Promise.resolve(cookies) }),
      },
    });

    await scenario.observeAnonymousCart();
    cookies = [];
    await scenario.dispose();

    expect(deletedCartIds).toStrictEqual(["cart-1"]);
  });
});
