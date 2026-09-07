import { expect, Given, Then, When } from "@repo/e2e-testing";
import type { DataTable, Page } from "@repo/e2e-testing";

import { defineSearchStore, requireSearchStore } from "./search-context";

interface SearchProduct {
  readonly availability: "in-stock" | "out-of-stock";
  readonly category: string;
  readonly categoryLabel: string;
  readonly objectID: string;
  readonly price: number;
  readonly slug: string;
  readonly title: string;
}

interface ProductSearchScenario {
  readonly locale: string;
  readonly products: readonly SearchProduct[];
}

const scenarios = new WeakMap<Page, ProductSearchScenario>();
const slugify = (value: string): string =>
  value
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, "-")
    .replaceAll(/^-|-$/gu, "");

const parseAvailability = (value: string): SearchProduct["availability"] => {
  if (value === "In stock") {
    return "in-stock";
  }
  if (value === "Out of stock") {
    return "out-of-stock";
  }
  throw new Error(`Unsupported Product availability ${value}`);
};

const productsFrom = (dataTable: DataTable): readonly SearchProduct[] => {
  const [headers, ...rows] = dataTable.raw();
  const expectedHeaders = [
    "Product",
    "Category",
    "Starting price",
    "Availability",
  ];
  if (headers?.join("|") !== expectedHeaders.join("|")) {
    throw new Error(
      `Expected Product Catalog fields ${expectedHeaders.join(", ")}`
    );
  }

  return rows.map((row) => {
    const [title, categoryLabel, rawPrice, rawAvailability] = row;
    if (
      title === undefined ||
      categoryLabel === undefined ||
      rawPrice === undefined ||
      rawAvailability === undefined
    ) {
      throw new Error("Every Product Catalog row must define all four fields");
    }
    const price = Number(rawPrice);
    if (!Number.isFinite(price)) {
      throw new TypeError(`Invalid Product price ${rawPrice}`);
    }
    const slug = slugify(title);
    return {
      availability: parseAvailability(rawAvailability),
      category: slugify(categoryLabel),
      categoryLabel,
      objectID: slug,
      price,
      slug,
      title,
    };
  });
};

const requireScenario = (page: Page): ProductSearchScenario => {
  const scenario = scenarios.get(page);
  if (scenario === undefined) {
    throw new Error("The scenario does not have a searchable Product Catalog");
  }
  return scenario;
};

Given(
  "Product search uses Store {string} with locale {string} and currency {string}",
  ({ page }, storeKey: string, locale: string, currency: string) => {
    if (storeKey.length === 0) {
      throw new Error("Product search Store must have a key");
    }
    defineSearchStore(page, { currency, locale, storeKey });
  }
);

Given(
  "the searchable Product Catalog contains:",
  ({ page }, dataTable: DataTable) => {
    const store = requireSearchStore(page);
    const scenario = {
      locale: store.locale,
      products: productsFrom(dataTable),
    };
    scenarios.set(page, scenario);
  }
);

Given("a buyer is viewing the Products Page", async ({ page }) => {
  const { locale } = requireScenario(page);
  await page.goto(locale === "en-US" ? "/products" : `/${locale}/products`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Products" })
  ).toBeVisible();
  for (const product of requireScenario(page).products) {
    // oxlint-disable-next-line no-await-in-loop -- Every catalog precondition must be visible through the live Search provider.
    await expect(
      page.locator("[data-search-hit]").filter({ hasText: product.title })
    ).toBeVisible();
  }
});

Then(
  "the Product listing shows starting prices:",
  async ({ page }, dataTable: DataTable) => {
    const [headers, ...rows] = dataTable.raw();
    const expectedHeaders = ["Product", "Price starts at"];
    if (headers?.join("|") !== expectedHeaders.join("|")) {
      throw new Error(
        `Expected Product starting-price fields ${expectedHeaders.join(", ")}`
      );
    }

    for (const [productName, startingPrice] of rows) {
      if (productName === undefined || startingPrice === undefined) {
        throw new Error(
          "Every Product starting-price row must define both fields"
        );
      }
      const productCard = page
        .locator("[data-search-hit]")
        .filter({ hasText: productName });
      // oxlint-disable-next-line no-await-in-loop -- Product prices are asserted in scenario order for clearer failures.
      await expect(
        productCard.getByText(`Price starts at ${startingPrice}`, {
          exact: true,
        })
      ).toBeVisible();
    }
  }
);

Then(
  "the Product listing sidebar offers facets:",
  async ({ page }, dataTable: DataTable) => {
    const sidebar = page.getByRole("complementary", {
      name: "Product filters",
    });
    const [, ...rows] = dataTable.raw();
    for (const [facet] of rows) {
      if (facet === undefined) {
        throw new Error("Every facet row must name a facet");
      }
      // oxlint-disable-next-line no-await-in-loop -- Facets are asserted in scenario order for clearer failures.
      await expect(sidebar.getByRole("group", { name: facet })).toBeVisible();
    }
  }
);

const categoryFacet = (page: Page) =>
  page.getByRole("group", { name: "Category" });

Then("the Category facet initially shows 5 values", async ({ page }) => {
  await expect(categoryFacet(page).getByRole("checkbox")).toHaveCount(5);
});

When("the buyer shows more Category values", async ({ page }) => {
  await categoryFacet(page).getByRole("button", { name: "Show more" }).click();
});

Then("additional Category values are shown", async ({ page }) => {
  await expect
    .poll(async () => await categoryFacet(page).getByRole("checkbox").count())
    .toBeGreaterThan(5);
});

When(
  "the buyer refines the Product listing with:",
  async ({ page }, dataTable: DataTable) => {
    const [, ...rows] = dataTable.raw();
    for (const [, value] of rows) {
      if (value === undefined) {
        throw new Error("Every Product refinement must define a value");
      }
      // oxlint-disable-next-line no-await-in-loop -- Each refinement changes the next visible facet state.
      await page
        .getByRole("checkbox", { name: new RegExp(`^${value}`, "iu") })
        .click();
    }
  }
);

When(
  "the buyer sorts the Product listing by {string}",
  async ({ page }, sortLabel: string) => {
    await page.getByRole("combobox", { name: "Sort products" }).selectOption({
      label: sortLabel,
    });
  }
);

Then(
  "the Product listing shows Products in order:",
  async ({ page }, dataTable: DataTable) => {
    const [, ...rows] = dataTable.raw();
    const expectedProducts = rows.map(([product]) => product);
    await expect
      .poll(
        async () => await page.locator("[data-search-hit] h2").allTextContents()
      )
      .toStrictEqual(expectedProducts);
  }
);

Then("the current URL is {string}", async ({ page }, expectedUrl: string) => {
  await expect
    .poll(() => {
      const url = new URL(page.url());
      const pathname = url.pathname.replace(/^\/en-US(?=\/)/u, "");
      return `${pathname}${url.search}`;
    })
    .toBe(expectedUrl);
});

When(
  "the buyer opens Product {string} and returns to the Products Page",
  async ({ page }, productName: string) => {
    const productCard = page
      .locator("[data-search-hit]")
      .filter({ hasText: productName });
    const link = productCard.getByRole("link", { name: "View Details" });
    const href = await link.getAttribute("href");
    if (href === null) {
      throw new Error(`Product ${productName} does not link to a PDP`);
    }
    await page.evaluate((productHref) => {
      window.location.assign(productHref);
    }, href);
    await expect(page).toHaveURL(/\/product\//u);
    await page.goBack();
    await expect(
      page.getByRole("heading", { level: 1, name: "Products" })
    ).toBeVisible();
  }
);

Then(
  "the Product listing keeps the selected facets and sort order",
  async ({ page }) => {
    await expect(
      page.getByRole("checkbox", { name: /^Excavators/u })
    ).toBeChecked();
    await expect(
      page.getByRole("checkbox", { name: /^Loaders/u })
    ).toBeChecked();
    await expect(
      page.getByRole("checkbox", { name: /^In stock/iu })
    ).toBeChecked();
    await expect(
      page.getByRole("combobox", { name: "Sort products" })
    ).toHaveValue("products@price-asc");
    await expect
      .poll(
        async () => await page.locator("[data-search-hit] h2").allTextContents()
      )
      .toStrictEqual([
        "A790 Compact Excavator",
        "A789 BC Deep Mining Excavator",
      ]);
  }
);
