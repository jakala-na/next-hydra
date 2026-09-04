import { expect } from "@repo/e2e-testing";
import type { Locator, Page } from "@repo/e2e-testing";

import { expectMoney } from "./money.driver";

interface CartLineItemExpectation {
  readonly configuration: string;
  readonly lineTotal: MoneyExpectation;
  readonly productVariantName: string;
  readonly quantity: number;
  readonly unitPrice: MoneyExpectation;
}

interface MoneyExpectation {
  readonly amount: string;
  readonly currency: string;
}

interface SummaryExpectation {
  readonly item: string;
  readonly value: string;
}

function moneyFrom(value: string): MoneyExpectation {
  const match = /^(?<amount>\d+(?:\.\d{1,2})?) (?<currency>[A-Z]{3})$/u.exec(
    value
  );
  if (match?.groups === undefined) {
    throw new Error(`Expected money as "amount currency", received ${value}`);
  }
  return {
    amount: match.groups.amount ?? "",
    currency: match.groups.currency ?? "",
  };
}

function summaryMoneySelector(item: string): string | undefined {
  if (item === "Subtotal") {
    return "cart-page-subtotal";
  }
  if (item === "Shipping") {
    return "cart-page-shipping";
  }
  if (item === "Total") {
    return "cart-page-total";
  }
  return undefined;
}

export class CartPageDriver {
  readonly #page: Page;

  constructor(page: Page) {
    this.#page = page;
  }

  async visit(locale: string): Promise<void> {
    await this.#page.goto(`/${locale}/cart`);
    await expect(this.#cartSurface()).toBeVisible();
  }

  async expectCartLineItem(input: {
    readonly configuration: string;
    readonly lineTotal: string;
    readonly productVariantName: string;
    readonly quantity: string;
    readonly unitPrice: string;
  }): Promise<void> {
    const expectation: CartLineItemExpectation = {
      configuration: input.configuration,
      lineTotal: moneyFrom(input.lineTotal),
      productVariantName: input.productVariantName,
      quantity: Number(input.quantity),
      unitPrice: moneyFrom(input.unitPrice),
    };
    if (!Number.isSafeInteger(expectation.quantity)) {
      throw new TypeError(
        `Expected an integer quantity, received ${input.quantity}`
      );
    }

    const card = this.#cartLineItem(expectation.productVariantName);
    await expect(card).toBeVisible();
    await expect(
      card.getByRole("heading", { name: expectation.productVariantName })
    ).toBeVisible();
    await expect(
      card.getByText(expectation.configuration, { exact: true })
    ).toBeVisible();
    await expectMoney(
      card.locator('[data-commerce-money="cart-page-unit-price"]'),
      expectation.unitPrice.amount,
      expectation.unitPrice.currency
    );
    await this.expectCartLineItemQuantity(
      expectation.productVariantName,
      expectation.quantity,
      expectation.lineTotal.amount,
      expectation.lineTotal.currency
    );
  }

  async expectSummary(rows: readonly SummaryExpectation[]): Promise<void> {
    const summary = this.#cartPage().locator("[data-cart-page-summary]");
    await expect(summary).toBeVisible();
    await Promise.all(
      rows.map(async (row) => {
        if (row.item === "Shipping" && row.value === "Calculated at checkout") {
          await expect(
            summary.getByText(row.value, { exact: true })
          ).toBeVisible();
          return;
        }
        const selector = summaryMoneySelector(row.item);
        if (selector === undefined) {
          throw new Error(`Unknown Cart summary item: ${row.item}`);
        }
        const money = moneyFrom(row.value);
        await expectMoney(
          summary.locator(`[data-commerce-money="${selector}"]`),
          money.amount,
          money.currency
        );
      })
    );
  }

  async expectAction(action: string): Promise<void> {
    await expect(
      this.#cartSurface()
        .getByRole("link", { name: action })
        .or(this.#cartSurface().getByRole("button", { name: action }))
    ).toBeVisible();
  }

  async changeCartLineItemQuantity(
    productVariantName: string,
    target: number
  ): Promise<void> {
    const card = this.#cartLineItem(productVariantName);
    const quantity = card.locator("[data-cart-page-quantity]");
    let current = Number(await quantity.textContent());
    if (!Number.isSafeInteger(current) || target < 1) {
      throw new TypeError(
        `Cannot change Cart quantity from ${current} to ${target}`
      );
    }

    const direction = target > current ? "Increase" : "Decrease";
    while (current !== target) {
      const next = current + (target > current ? 1 : -1);
      // oxlint-disable-next-line eslint/no-await-in-loop -- Each Cart mutation must settle before the next quantity change.
      await card
        .getByRole("button", {
          name: `${direction} quantity for ${productVariantName}`,
        })
        .click();
      // oxlint-disable-next-line eslint/no-await-in-loop -- The next mutation depends on this rendered quantity.
      await expect(quantity).toHaveText(String(next));
      current = next;
    }
  }

  async expectCartLineItemQuantity(
    productVariantName: string,
    quantity: number,
    amount: string,
    currency: string
  ): Promise<void> {
    const card = this.#cartLineItem(productVariantName);
    await expect(card.locator("[data-cart-page-quantity]")).toHaveText(
      String(quantity)
    );
    await expectMoney(
      card.locator('[data-commerce-money="cart-page-line-total"]'),
      amount,
      currency
    );
  }

  async expectSubtotal(amount: string, currency: string): Promise<void> {
    await expectMoney(
      this.#cartPage().locator('[data-commerce-money="cart-page-subtotal"]'),
      amount,
      currency
    );
  }

  async expectText(text: string): Promise<void> {
    await expect(
      this.#cartSurface().getByText(text, { exact: true })
    ).toBeVisible();
  }

  async openCheckout(locale: string): Promise<void> {
    await this.#page.goto(`/${locale}/checkout`);
  }

  async expectRedirectedFromCheckout(locale: string): Promise<void> {
    await expect(this.#page).toHaveURL(`/${locale}/cart`);
    await expect(this.#cartPage()).toBeVisible();
  }

  #cartPage(): Locator {
    return this.#page.locator("main[data-cart-page]");
  }

  #cartSurface(): Locator {
    return this.#page.locator(
      "main[data-cart-page], main[data-cart-page-error]"
    );
  }

  #cartLineItem(productVariantName: string): Locator {
    return this.#cartPage()
      .locator("[data-cart-page-line-item]")
      .filter({ hasText: productVariantName });
  }
}
