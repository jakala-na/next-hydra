import { randomUUID } from "node:crypto";

import type { CartId } from "@repo/commerce/domain/cart";
import { CurrencyCode } from "@repo/commerce/domain/money";
import {
  ANONYMOUS_CART_COOKIE_NAME,
  encodeAnonymousCartCookie,
  makeAnonymousCartCookie,
} from "@repo/commerce/lib/cart/utils/anonymous-cart-cookies";
import { CommerceLocale, Store, StoreKey } from "@repo/commerce/store";
import {
  e2eApplicationUrlsFromEnvironment,
  Given,
  Then,
  When,
} from "@repo/e2e-testing";
import type { DataTable } from "@repo/e2e-testing";
import { Schema } from "effect";

import { rowsWithHeaders } from "../data-table";
import { CartPageDriver } from "../drivers/cart-page.driver";
import { CartDriver } from "../drivers/cart.driver";

const cartIdForCondition = async (
  condition: string,
  createLegacyCart: () => Promise<CartId>,
  createCustomerOwnedCart: () => Promise<CartId>
) => {
  if (condition === "missing") {
    return `missing-${randomUUID()}`;
  }
  if (condition === "incompatible with current Checkout rules") {
    return await createLegacyCart();
  }
  if (condition === "owned by a customer") {
    return await createCustomerOwnedCart();
  }
  throw new Error(`Unsupported Cart condition: ${condition}`);
};

Given(
  "the anonymous buyer's Cart is {string}",
  async ({ checkoutScenario, page }, condition: string) => {
    const store = checkoutScenario.requireStore();
    const cartId = await cartIdForCondition(
      condition,
      async () => await checkoutScenario.createLegacyCart(),
      async () => await checkoutScenario.createCustomerOwnedCart()
    );
    const cookie = makeAnonymousCartCookie({
      cartId,
      store: new Store({
        currency: CurrencyCode.make(store.currency),
        locale: Schema.decodeUnknownSync(CommerceLocale)(store.locale),
        storeKey: StoreKey.make(store.key),
      }),
    });
    await page.context().addCookies([
      {
        name: ANONYMOUS_CART_COOKIE_NAME,
        url: e2eApplicationUrlsFromEnvironment().web,
        value: encodeAnonymousCartCookie(cookie),
      },
    ]);
  }
);

function valueFor(row: ReadonlyMap<string, string>, key: string): string {
  const value = row.get(key);
  if (value === undefined) {
    throw new Error(`Cart Page table is missing ${key}`);
  }
  return value;
}

When("the buyer opens the Cart page from the Cart flyout", async ({ page }) => {
  await new CartDriver(page).openCartPage();
});

Then(
  "the Cart page shows a Cart Line Item:",
  async ({ page }, dataTable: DataTable) => {
    const rows = rowsWithHeaders(dataTable, [
      "Product Variant",
      "Configuration",
      "Unit price",
      "Quantity",
      "Line total",
    ]);
    const [row] = rows;
    if (row === undefined || rows.length !== 1) {
      throw new Error("Expected exactly one Cart Line Item");
    }
    await new CartPageDriver(page).expectCartLineItem({
      configuration: valueFor(row, "Configuration"),
      lineTotal: valueFor(row, "Line total"),
      productVariantName: valueFor(row, "Product Variant"),
      quantity: valueFor(row, "Quantity"),
      unitPrice: valueFor(row, "Unit price"),
    });
  }
);

Then(
  "the Cart page Order Summary shows:",
  async ({ page }, dataTable: DataTable) => {
    const rows = rowsWithHeaders(dataTable, ["Item", "Value"]);
    await new CartPageDriver(page).expectSummary(
      rows.map((row) => ({
        item: valueFor(row, "Item"),
        value: valueFor(row, "Value"),
      }))
    );
  }
);

Then("the Cart page offers {string}", async ({ page }, action: string) => {
  await new CartPageDriver(page).expectAction(action);
});

When(
  "the buyer changes the Cart Line Item quantity to {int} on the Cart page",
  async ({ checkoutScenario, page }, quantity: number) => {
    await new CartPageDriver(page).changeCartLineItemQuantity(
      checkoutScenario.requireProduct().name,
      quantity
    );
  }
);

Then(
  "the Cart Line Item quantity is {int} with line total {string} in currency {string}",
  async (
    { checkoutScenario, page },
    quantity: number,
    amount: string,
    currency: string
  ) => {
    await new CartPageDriver(page).expectCartLineItemQuantity(
      checkoutScenario.requireProduct().name,
      quantity,
      amount,
      currency
    );
  }
);

Then(
  "the Cart page subtotal is {string} in currency {string}",
  async ({ page }, amount: string, currency: string) => {
    await new CartPageDriver(page).expectSubtotal(amount, currency);
  }
);

When("the buyer visits the Cart page", async ({ checkoutScenario, page }) => {
  await new CartPageDriver(page).visit(checkoutScenario.requireStore().locale);
});

Then("the Cart page shows {string}", async ({ page }, text: string) => {
  await new CartPageDriver(page).expectText(text);
});

When("the buyer opens Checkout again", async ({ checkoutScenario, page }) => {
  await new CartPageDriver(page).openCheckout(
    checkoutScenario.requireStore().locale
  );
});

Then(
  "the buyer is redirected to the Cart page",
  async ({ checkoutScenario, page }) => {
    await new CartPageDriver(page).expectRedirectedFromCheckout(
      checkoutScenario.requireStore().locale
    );
  }
);
