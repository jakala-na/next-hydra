import { expect, Given, Then, When } from "@repo/e2e-testing";
import type { DataTable, Page } from "@repo/e2e-testing";
import { z } from "zod";

import { validateSearchBatch } from "../../validation";

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
  readonly currency: string;
  readonly locale: string;
  readonly products: readonly SearchProduct[];
}

const scenarios = new WeakMap<Page, ProductSearchScenario>();
const stores = new WeakMap<
  Page,
  {
    readonly currency: string;
    readonly locale: string;
  }
>();

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

const mockFacetFilterSchema = z.union([z.string(), z.array(z.string())]);
const mockSearchParametersSchema = z
  .object({
    facetFilters: z.array(mockFacetFilterSchema).default([]),
    hitsPerPage: z.number().default(20),
    numericFilters: z.array(mockFacetFilterSchema).default([]),
    page: z.number().default(0),
    query: z.string().default(""),
  })
  .passthrough();
const mockSearchRequestSchema = z
  .object({
    indexName: z.string().default("products"),
    params: mockSearchParametersSchema.default({}),
  })
  .passthrough();
const mockSearchBatchSchema = z.object({
  requests: z.array(mockSearchRequestSchema),
});

type MockFacetFilter = z.infer<typeof mockFacetFilterSchema>;
type MockSearchRequest = z.infer<typeof mockSearchRequestSchema>;

const facetMatches = (
  product: SearchProduct,
  filter: MockFacetFilter
): boolean => {
  if (Array.isArray(filter)) {
    return filter.some((candidate) => facetMatches(product, candidate));
  }

  const separator = filter.indexOf(":");
  const attribute = filter.slice(0, separator);
  const value = filter.slice(separator + 1);
  if (attribute === "category") {
    return product.category === value;
  }
  if (attribute === "availability") {
    return product.availability === value;
  }
  return true;
};

const numericMatches = (
  product: SearchProduct,
  filter: MockFacetFilter
): boolean => {
  if (Array.isArray(filter)) {
    return filter.some((candidate) => numericMatches(product, candidate));
  }
  const match =
    /^price(?<operator><=|>=|=|<|>)(?<rawValue>-?\d+(?:\.\d+)?)$/u.exec(filter);
  const operator = match?.groups?.operator;
  const rawValue = match?.groups?.rawValue;
  if (operator === undefined || rawValue === undefined) {
    return true;
  }
  const value = Number(rawValue);
  if (operator === "<") {
    return product.price < value;
  }
  if (operator === "<=") {
    return product.price <= value;
  }
  if (operator === "=") {
    return product.price === value;
  }
  if (operator === ">") {
    return product.price > value;
  }
  if (operator === ">=") {
    return product.price >= value;
  }
  return true;
};

const facetCounts = (
  products: readonly SearchProduct[],
  attribute: "availability" | "category"
) => {
  const counts = new Map<string, number>();
  for (const product of products) {
    const value = product[attribute];
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Object.fromEntries(counts);
};

const searchResponse = (
  scenario: ProductSearchScenario,
  request: MockSearchRequest
) => {
  const { params } = request;
  const { facetFilters, hitsPerPage, numericFilters, page, query } = params;
  const normalizedQuery = query.trim().toLowerCase();
  const products = scenario.products.filter(
    (product) =>
      (normalizedQuery.length === 0 ||
        product.title.toLowerCase().includes(normalizedQuery)) &&
      facetFilters.every((filter) => facetMatches(product, filter)) &&
      numericFilters.every((filter) => numericMatches(product, filter))
  );

  const { indexName } = request;
  if (indexName === "products@price-asc") {
    // oxlint-disable-next-line unicorn/no-array-sort -- Array#filter created this scenario-local result array, so in-place sorting cannot mutate catalog fixtures.
    products.sort((left, right) => left.price - right.price);
  } else if (indexName === "products@price-desc") {
    // oxlint-disable-next-line unicorn/no-array-sort -- Array#filter created this scenario-local result array, so in-place sorting cannot mutate catalog fixtures.
    products.sort((left, right) => right.price - left.price);
  }

  const firstHit = page * hitsPerPage;
  const prices = products.map(({ price }) => price);
  const priceSum = prices.reduce((sum, price) => sum + price, 0);

  return {
    facets: {
      availability: facetCounts(products, "availability"),
      category: facetCounts(products, "category"),
    },
    facets_stats:
      prices.length === 0
        ? {}
        : {
            price: {
              avg: priceSum / prices.length,
              max: Math.max(...prices),
              min: Math.min(...prices),
              sum: priceSum,
            },
          },
    hits: products.slice(firstHit, firstHit + hitsPerPage).map((product) => ({
      categories: [{ key: product.category, label: product.categoryLabel }],
      objectID: product.objectID,
      productCard: {
        availableForSale: product.availability === "in-stock",
        id: product.objectID,
        slug: product.slug,
        startingPrice: {
          centAmount: product.price * 100,
          currencyCode: scenario.currency,
        },
        title: product.title,
      },
    })),
    hitsPerPage,
    index: indexName,
    nbHits: products.length,
    nbPages: Math.ceil(products.length / hitsPerPage),
    page,
    processingTimeMS: 1,
    query,
  };
};

const installSearchProvider = async (
  page: Page,
  scenario: ProductSearchScenario
): Promise<void> => {
  await page.route("**/api/search/**", async (route) => {
    const body: unknown = route.request().postDataJSON();
    const requests = validateSearchBatch(body);
    const parsedBatch = mockSearchBatchSchema.parse({ requests });
    await route.fulfill({
      contentType: "application/json",
      json: {
        results: parsedBatch.requests.map((request) =>
          searchResponse(scenario, request)
        ),
      },
      status: 200,
    });
  });

  await page.route("**/product/**", async (route) => {
    const product = scenario.products.find(({ slug }) =>
      route.request().url().includes(`/product/${slug}`)
    );
    await route.fulfill({
      body: `<!doctype html><html lang="${scenario.locale}"><body><h1>${product?.title ?? "Product"}</h1></body></html>`,
      contentType: "text/html",
      status: 200,
    });
  });
};

Given(
  "Product search uses Store {string} with locale {string} and currency {string}",
  ({ page }, storeKey: string, locale: string, currency: string) => {
    if (storeKey.length === 0) {
      throw new Error("Product search Store must have a key");
    }
    stores.set(page, { currency, locale });
  }
);

Given(
  "the searchable Product Catalog contains:",
  async ({ page }, dataTable: DataTable) => {
    const store = stores.get(page);
    if (store === undefined) {
      throw new Error("The scenario does not define a Product search Store");
    }
    const scenario = {
      currency: store.currency,
      locale: store.locale,
      products: productsFrom(dataTable),
    };
    scenarios.set(page, scenario);
    await installSearchProvider(page, scenario);
  }
);

Given("a buyer is viewing the Products Page", async ({ page }) => {
  const { locale } = requireScenario(page);
  await page.goto(locale === "en-US" ? "/products" : `/${locale}/products`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Products" })
  ).toBeVisible();
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
