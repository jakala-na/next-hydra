/* oxlint-disable typescript/promise-function-async -- Test doubles return already-settled promises to implement asynchronous browser and cleanup ports. */
import { describe, expect, it } from "vitest";

import { CartId } from "../domain/cart";
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
  it("cleans the current anonymous Cart and its Payments during teardown", async () => {
    const cleanup: string[] = [];
    const scenario = new CheckoutScenario({
      deleteCart: (cartId) => {
        cleanup.push(`cart:${cartId}`);
        return Promise.resolve();
      },
      deletePayments: (cartId) => {
        cleanup.push(`payments:${cartId}`);
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

    expect(cleanup).toStrictEqual(["cart:cart-1", "payments:cart-1"]);
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

  it("creates and cleans a customer-owned Cart fixture", async () => {
    const createdFor: unknown[] = [];
    const cleanup: string[] = [];
    const scenario = new CheckoutScenario({
      createCustomerOwnedCart: (input) => {
        createdFor.push(input);
        return Promise.resolve({
          cartId: CartId.make("customer-cart-1"),
          customerId: "customer-1",
        });
      },
      deleteCart: (cartId) => {
        cleanup.push(`cart:${cartId}`);
        return Promise.resolve();
      },
      deleteCustomer: (customerId) => {
        cleanup.push(`customer:${customerId}`);
        return Promise.resolve();
      },
      page: {
        context: () => ({ cookies: () => Promise.resolve([]) }),
      },
    });
    scenario.defineStore({
      currency: "USD",
      key: "default-store",
      locale: "en-US",
    });

    await expect(scenario.createCustomerOwnedCart()).resolves.toBe(
      "customer-cart-1"
    );
    await scenario.dispose();

    expect(createdFor).toStrictEqual([
      { currency: "USD", storeKey: "default-store" },
    ]);
    expect(cleanup).toStrictEqual([
      "cart:customer-cart-1",
      "customer:customer-1",
    ]);
  });

  it("cleans Payments for a remembered authenticated Cart", async () => {
    const deletedPaymentCartIds: string[] = [];
    const scenario = new CheckoutScenario({
      deleteCart: () => Promise.resolve(),
      deletePayments: (cartId) => {
        deletedPaymentCartIds.push(cartId);
        return Promise.resolve();
      },
      page: {
        context: () => ({ cookies: () => Promise.resolve([]) }),
      },
    });

    scenario.rememberCart(CartId.make("business-unit-cart-1"));
    await scenario.dispose();

    expect(deletedPaymentCartIds).toStrictEqual(["business-unit-cart-1"]);
  });

  it("inspects a remembered Card Payment after its Cart cookie disappears", async () => {
    const inspectedCartIds: string[] = [];
    const scenario = new CheckoutScenario({
      deleteCart: () => Promise.resolve(),
      expectCardNotAuthorized: (cartId) => {
        inspectedCartIds.push(cartId);
        return Promise.resolve();
      },
      page: {
        context: () => ({ cookies: () => Promise.resolve([]) }),
      },
    });

    scenario.rememberCart(CartId.make("cart-from-payment-step"));
    await scenario.expectCardNotAuthorized();

    expect(inspectedCartIds).toStrictEqual(["cart-from-payment-step"]);
  });

  it("compares Net Terms seed fields after financial activity is recorded", async () => {
    const scenario = new CheckoutScenario({
      deleteCart: () => Promise.resolve(),
      getNetTerms: () =>
        Promise.resolve({
          availableCredit: { centAmount: 300_000, currencyCode: "USD" },
          ledger: [
            {
              amount: { centAmount: 1_700_000, currencyCode: "USD" },
              direction: "debit",
              reference: "credit-authorization-1",
            },
          ],
          termsInDays: 30,
        }),
      page: {
        context: () => ({ cookies: () => Promise.resolve([]) }),
      },
    });

    await expect(
      scenario.expectNetTerms({
        amount: "3000.00",
        businessUnitId: "business-unit-1",
        currency: "USD",
        termsInDays: 30,
      })
    ).resolves.toBeUndefined();
  });
});
