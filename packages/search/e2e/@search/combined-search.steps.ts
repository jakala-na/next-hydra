import { expect, Given, Then, When } from "@repo/e2e-testing";
import type { DataTable, Page } from "@repo/e2e-testing";
import { z } from "zod";

import { validateSearchBatch } from "../../validation";

interface CombinedSearchScenario {
  readonly products: readonly string[];
  readonly resources: readonly string[];
}

const scenarios = new WeakMap<Page, CombinedSearchScenario>();
const visibleRows = new WeakMap<Page, readonly string[]>();
const IRRELEVANT_RESOURCE_TITLE = "Operator safety checklist";

const matchingTitles = (type: "Product" | "Resource"): readonly string[] =>
  Array.from({ length: 7 }, (_, index) => `Excavator ${type} ${index + 1}`);

const updateScenario = (
  page: Page,
  update: Partial<CombinedSearchScenario>
): CombinedSearchScenario => {
  const current = scenarios.get(page);
  const scenario = {
    products: update.products ?? current?.products ?? [],
    resources: update.resources ?? current?.resources ?? [],
  };
  scenarios.set(page, scenario);
  return scenario;
};

const requestSchema = z.object({
  indexName: z.enum([
    "products",
    "products@price-asc",
    "products@price-desc",
    "resources",
  ]),
  params: z
    .object({
      hitsPerPage: z.number().default(20),
      page: z.number().default(0),
      query: z.string().default(""),
    })
    .passthrough(),
});

type MockSearchRequest = z.infer<typeof requestSchema>;

const productHit = (title: string, index: number) => ({
  categories: [{ key: "excavators", label: "Excavators" }],
  objectID: `product-${index + 1}`,
  productCard: {
    availableForSale: true,
    id: `product-${index + 1}`,
    slug: `excavator-product-${index + 1}`,
    startingPrice: {
      centAmount: (10_000 + index * 1000) * 100,
      currencyCode: "USD",
    },
    title,
  },
});

const resourceHit = (title: string, index: number) => ({
  objectID: `resource-${index + 1}`,
  resourceCard: {
    id: `resource-${index + 1}`,
    path: `/resources/excavator-resource-${index + 1}`,
    publishedAt: "2026-08-22",
    summary: `Guidance for excavator job ${index + 1}.`,
    title,
  },
});

const searchResponse = (
  scenario: CombinedSearchScenario,
  request: MockSearchRequest
) => {
  const { hitsPerPage, page, query } = request.params;
  const resourceIndex = request.indexName === "resources";
  const titles = resourceIndex ? scenario.resources : scenario.products;
  const normalizedQuery = query.trim().toLowerCase();
  const matching = titles.filter(
    (title) =>
      normalizedQuery.length === 0 ||
      title.toLowerCase().includes(normalizedQuery)
  );
  const firstHit = page * hitsPerPage;

  return {
    hits: matching
      .slice(firstHit, firstHit + hitsPerPage)
      .map((title, index) =>
        resourceIndex
          ? resourceHit(title, firstHit + index)
          : productHit(title, firstHit + index)
      ),
    hitsPerPage,
    index: request.indexName,
    nbHits: matching.length,
    nbPages: Math.ceil(matching.length / hitsPerPage),
    page,
    processingTimeMS: 1,
    query,
  };
};

const installSearchProvider = async (
  page: Page,
  scenario: CombinedSearchScenario
): Promise<void> => {
  await page.route("**/api/search/**", async (route) => {
    const body: unknown = route.request().postDataJSON();
    const requests = validateSearchBatch(body).map((request) =>
      requestSchema.parse(request)
    );
    await route.fulfill({
      contentType: "application/json",
      json: {
        results: requests.map((request) => searchResponse(scenario, request)),
      },
      status: 200,
    });
  });
};

Given(
  "searchable Products include several results for {string}",
  ({ page }, query: string) => {
    if (query.toLowerCase() !== "excavator") {
      throw new Error(`No Product search fixture exists for ${query}`);
    }
    updateScenario(page, { products: matchingTitles("Product") });
  }
);

Given(
  "searchable Resources include several results for {string}",
  async ({ page }, query: string) => {
    if (query.toLowerCase() !== "excavator") {
      throw new Error(`No Resource search fixture exists for ${query}`);
    }
    const scenario = updateScenario(page, {
      resources: [IRRELEVANT_RESOURCE_TITLE, ...matchingTitles("Resource")],
    });
    await installSearchProvider(page, scenario);
  }
);

Given("a visitor searches for {string}", async ({ page }, query: string) => {
  await page.goto(`/fr-FR/search?q=${encodeURIComponent(query)}`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Products and Resources" })
  ).toBeVisible();
  await expect(
    page.getByRole("searchbox", { name: "Search Products and Resources" })
  ).toHaveValue(query);
});

Then(
  "the Search Page shows these tabs:",
  async ({ page }, dataTable: DataTable) => {
    const [, ...rows] = dataTable.raw();
    for (const [tab, selected] of rows) {
      if (tab === undefined || selected === undefined) {
        throw new Error("Every Search tab row must define its selection state");
      }
      // oxlint-disable-next-line no-await-in-loop -- Tabs are asserted in the feature's presentation order for clearer failures.
      await expect(page.getByRole("tab", { name: tab })).toHaveAttribute(
        "aria-selected",
        selected === "Yes" ? "true" : "false"
      );
    }
  }
);

Then(
  "the All tab previews relevant result rows from:",
  async ({ page }, dataTable: DataTable) => {
    const [, ...rows] = dataTable.raw();
    for (const [resultType] of rows) {
      if (resultType === undefined) {
        throw new Error("Every preview row must define a result type");
      }
      const section = page.getByRole("region", { name: resultType });
      const dataType = resultType === "Products" ? "product" : "resource";
      // oxlint-disable-next-line no-await-in-loop -- Result groups are asserted independently for actionable failures.
      await expect(
        section.locator(`[data-search-result-type="${dataType}"]`).first()
      ).toBeVisible();
      if (resultType === "Resources") {
        // oxlint-disable-next-line no-await-in-loop -- The nonmatching record proves the Resource child index receives the shared query.
        await expect(section).not.toContainText(IRRELEVANT_RESOURCE_TITLE);
        // oxlint-disable-next-line no-await-in-loop -- Resource navigation is verified in the same localized result group.
        await expect(
          section.getByRole("link", { name: "Read guide" }).first()
        ).toHaveAttribute("href", /^\/fr-FR\/resources\//u);
      }
    }
  }
);

Then(
  "the All tab offers these actions:",
  async ({ page }, dataTable: DataTable) => {
    const [, ...rows] = dataTable.raw();
    for (const [results, action] of rows) {
      if (results === undefined || action === undefined) {
        throw new Error("Every Search action row must define a result group");
      }
      // oxlint-disable-next-line no-await-in-loop -- Actions are scoped to their result sections to guard the composition.
      await expect(
        page.getByRole("region", { name: results }).getByRole("link", {
          name: action,
        })
      ).toBeVisible();
    }
  }
);

When(
  "the visitor chooses {string} from the All tab",
  async ({ page }, action: string) => {
    await page.getByRole("link", { name: action }).click();
  }
);

Then("the {string} tab is selected", async ({ page }, tab: string) => {
  await expect(page.getByRole("tab", { name: tab })).toHaveAttribute(
    "aria-selected",
    "true"
  );
});

Then(
  "the result rows contain only {word} results",
  async ({ page }, resultType: string) => {
    const expectedType = resultType.toLowerCase();
    const otherType = expectedType === "product" ? "resource" : "product";
    const rows = page.locator(`[data-search-result-type="${expectedType}"]`);
    await expect(rows.first()).toBeVisible();
    await expect(
      page.locator(`[data-search-result-type="${otherType}"]`)
    ).toHaveCount(0);
    visibleRows.set(page, await rows.allTextContents());
  }
);

Then("no facet controls are shown", async ({ page }) => {
  await expect(
    page.getByRole("complementary", { name: "Product filters" })
  ).toHaveCount(0);
});

Then("the search URL keeps the query and active tab", async ({ page }) => {
  const selectedTab = await page
    .getByRole("tab", { selected: true })
    .textContent();
  await expect
    .poll(() => {
      const url = new URL(page.url());
      return {
        query: url.searchParams.get("q"),
        tab: url.searchParams.get("tab"),
      };
    })
    .toStrictEqual({
      query: "excavator",
      tab: selectedTab?.toLowerCase(),
    });
});

When("the visitor opens the next results page", async ({ page }) => {
  await page.getByRole("link", { exact: true, name: "Next" }).click();
});

Then(
  "another page of {word} result rows is shown",
  async ({ page }, resultType: string) => {
    const rows = page.locator(
      `[data-search-result-type="${resultType.toLowerCase()}"]`
    );
    await expect(rows.first()).toBeVisible();
    await expect
      .poll(async () => await rows.allTextContents())
      .not.toStrictEqual(visibleRows.get(page));
  }
);

Then(
  "the search URL keeps the query, active tab, and page",
  async ({ page }) => {
    const selectedTab = await page
      .getByRole("tab", { selected: true })
      .textContent();
    await expect
      .poll(() => {
        const url = new URL(page.url());
        return {
          page: url.searchParams.get("page"),
          query: url.searchParams.get("q"),
          tab: url.searchParams.get("tab"),
        };
      })
      .toStrictEqual({
        page: "2",
        query: "excavator",
        tab: selectedTab?.toLowerCase(),
      });
  }
);
