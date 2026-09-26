import { CommerceLocale, resolveStore } from "@repo/commerce/store";
import { expect } from "@repo/e2e-testing";
import type { Locator, Page } from "@repo/e2e-testing";
import { regions } from "@repo/i18n/config";

import { matchesVariantAttributes } from "../checkout-expectations";
import type {
  ProductExpectation,
  StoreExpectation,
} from "../checkout-scenario";
import { expectMoney } from "./money.driver";

export class CatalogDriver {
  readonly #page: Page;

  constructor(page: Page) {
    this.#page = page;
  }

  async switchStore(store: StoreExpectation): Promise<void> {
    const region = regions.find(
      ({ currency, localeCode }) =>
        currency === store.currency && localeCode === store.locale
    );
    if (region === undefined) {
      throw new Error(
        `No customer region selects locale ${store.locale} in currency ${store.currency}`
      );
    }

    const resolvedStore = resolveStore({
      locale: CommerceLocale.make(region.localeCode),
    });
    if (
      resolvedStore.storeKey !== store.key ||
      resolvedStore.currency !== store.currency
    ) {
      throw new Error(
        `Locale ${store.locale} resolves Store ${resolvedStore.storeKey}/${resolvedStore.currency}, not ${store.key}/${store.currency}`
      );
    }

    await this.#page.goto("/");
    const regionSelector = this.#page.getByRole("button", {
      name: /^Current region /u,
    });
    await regionSelector.click();
    await this.#page
      .getByRole("menuitem")
      .filter({ hasText: region.displayName })
      .click();

    await expect(this.#page.locator("html")).toHaveAttribute(
      "lang",
      store.locale
    );
    await expect(
      this.#page.getByRole("button", {
        name: `Current region ${region.displayName}`,
      })
    ).toBeVisible();
    await this.#expectCommerceContext(store);
  }

  async expectLiveProduct(
    product: ProductExpectation,
    store: StoreExpectation
  ): Promise<void> {
    await expect(this.#productCard(product.name)).toBeVisible();
    await this.openProduct(product.name);
    await this.#expectCommerceContext(store);
    await this.selectVariant(product.attributes);
    await expect(
      this.#page.getByText("In Stock", { exact: true }).first()
    ).toBeVisible();
    await expectMoney(
      this.#page.locator('[data-commerce-money="product-price"]'),
      product.price,
      product.currency
    );

    await this.#page.goto(`/${store.locale}`);
    await expect(this.#productCard(product.name)).toBeVisible();
  }

  async openProduct(productName: string): Promise<void> {
    await this.#productCard(productName)
      .getByRole("link", { name: "View Details" })
      .click();
    await expect(
      this.#page.getByRole("heading", { level: 2, name: productName })
    ).toBeVisible({ timeout: 30_000 });
  }

  async selectVariant(attributes: ReadonlyMap<string, string>): Promise<void> {
    if (attributes.size === 0) {
      throw new Error("The Product Variant must define at least one attribute");
    }

    const group = this.#page.getByRole("radiogroup");
    await expect(group).toBeVisible();
    const radios = await group.getByRole("radio").all();
    let selected: Locator | undefined;
    for (const radio of radios) {
      // oxlint-disable-next-line no-await-in-loop -- Each rendered Product Variant must be inspected until the requested attributes match.
      const renderedAttributes = await radio
        .locator("[data-commerce-product-option]")
        .evaluateAll((markers) =>
          markers.map((marker) => ({
            name: marker.dataset.productOptionName ?? "",
            value: marker.dataset.productOptionValue ?? "",
          }))
        );
      if (matchesVariantAttributes(renderedAttributes, attributes)) {
        selected = radio;
        break;
      }
    }

    if (selected === undefined) {
      throw new Error(
        `No live Product Variant has attributes ${JSON.stringify(Object.fromEntries(attributes))}`
      );
    }

    await expect(selected).toBeEnabled();
    await selected.click();
    await expect(selected).toBeChecked();
  }

  async addSelectedVariantToCart(quantity: number): Promise<void> {
    const quantityInput = this.#page.getByLabel("Quantity", { exact: true });
    await quantityInput.fill(String(quantity));
    await quantityInput.blur();
    await this.#page.getByRole("button", { name: "Add to Cart" }).click();
    await expect(this.#page.getByRole("dialog")).toBeVisible();
  }

  async #expectCommerceContext(store: StoreExpectation): Promise<void> {
    const context = this.#page.locator("[data-commerce-context]").first();
    await expect(context).toHaveAttribute("data-store-key", store.key);
    await expect(context).toHaveAttribute("data-locale", store.locale);
    await expect(context).toHaveAttribute("data-currency", store.currency);
  }

  #productCard(productName: string): Locator {
    return this.#page
      .locator('[data-slot="card"]')
      .filter({ hasText: productName })
      .first();
  }
}
