import { expect } from "@repo/e2e-testing";
import type { Locator, Page } from "@repo/e2e-testing";

import { expectMoney } from "./money.driver";

export class CartDriver {
  readonly #page: Page;

  constructor(page: Page) {
    this.#page = page;
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

  async proceedTo(destination: string): Promise<void> {
    if (destination !== "Checkout") {
      throw new Error(`Unsupported Cart destination: ${destination}`);
    }

    await this.#cart()
      .getByRole("link", { name: "Proceed to Checkout" })
      .click();
    await expect(this.#page).toHaveURL(/\/checkout\/?$/u);
  }

  #cart(): Locator {
    return this.#page.getByRole("dialog");
  }
}
