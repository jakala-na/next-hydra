import { expect, Given, Then, When } from "@repo/e2e-testing";
import type { DataTable, Page } from "@repo/e2e-testing";

interface CombinedSearchScenario {
  readonly productQuery?: string;
  readonly resourceQuery?: string;
}

const scenarios = new WeakMap<Page, CombinedSearchScenario>();
const visibleRows = new WeakMap<Page, readonly string[]>();
const IRRELEVANT_RESOURCE_TITLE =
  "A practical preventive maintenance checklist";

const updateScenario = (
  page: Page,
  update: Partial<CombinedSearchScenario>
): CombinedSearchScenario => {
  const current = scenarios.get(page);
  const scenario = {
    productQuery: update.productQuery ?? current?.productQuery,
    resourceQuery: update.resourceQuery ?? current?.resourceQuery,
  };
  scenarios.set(page, scenario);
  return scenario;
};

Given(
  "searchable Products include several results for {string}",
  ({ page }, query: string) => {
    if (query.trim().length === 0) {
      throw new Error("The Product search precondition requires a query");
    }
    updateScenario(page, { productQuery: query });
  }
);

Given(
  "searchable Resources include several results for {string}",
  ({ page }, query: string) => {
    if (query.trim().length === 0) {
      throw new Error("The Resource search precondition requires a query");
    }
    updateScenario(page, { resourceQuery: query });
  }
);

Given("a visitor searches for {string}", async ({ page }, query: string) => {
  const scenario = scenarios.get(page);
  if (scenario?.productQuery !== query || scenario.resourceQuery !== query) {
    throw new Error(
      `The live Search catalog must include Product and Resource results for ${query}`
    );
  }
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
