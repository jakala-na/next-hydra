import { expect } from "@repo/e2e-testing";
import type { Locator, Page } from "@repo/e2e-testing";

import { expectMoney } from "./money.driver";

export class CartDriver {
  readonly #page: Page;

  constructor(page: Page) {
    this.#page = page;
  }

  async open(): Promise<void> {
    await this.#page.locator("[data-cart-trigger]").click();
    await expect(this.#cart()).toBeVisible();
  }

  async expectEmpty(): Promise<void> {
    const cart = this.#cart();
    await expect(cart).toBeVisible();
    await expect(
      cart.getByRole("heading", { name: "Your cart is empty" })
    ).toBeVisible();
    await expect(cart.locator("[data-cart-line-item]")).toHaveCount(0);
  }

  async expectOpenWithProduct(
    quantity: number,
    productName: string
  ): Promise<void> {
    const cart = this.#cart();
    await expect(cart).toBeVisible();
    await expect(
      cart.getByRole("heading", { name: `Shopping Cart (${quantity})` })
    ).toBeVisible();
    await expect(cart.getByText(productName, { exact: true })).toBeVisible();
  }

  async expectSubtotal(amount: string, currency: string): Promise<void> {
    await expectMoney(
      this.#cart().locator('[data-commerce-money="cart-subtotal"]'),
      amount,
      currency
    );
  }

  async expectProductSummary(
    productName: string,
    summary: string
  ): Promise<void> {
    const lineItem = this.#cart()
      .locator("[data-cart-line-item]")
      .filter({ hasText: productName });
    await expect(lineItem.getByText(summary, { exact: true })).toBeVisible();
  }

  async proceedTo(destination: string): Promise<void> {
    if (destination !== "Checkout") {
      throw new Error(`Unsupported Cart destination: ${destination}`);
    }

    await Promise.all([
      this.#page.waitForURL(/\/checkout\/?$/u),
      this.#cart().getByRole("link", { name: "Proceed to Checkout" }).click(),
    ]);
  }

  #cart(): Locator {
    return this.#page.getByRole("dialog");
  }
}
