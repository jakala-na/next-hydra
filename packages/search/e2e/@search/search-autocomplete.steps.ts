import { expect, Given, Then, When } from "@repo/e2e-testing";
import type { DataTable, Page } from "@repo/e2e-testing";

import { requireSearchStore } from "./search-context";

type DirectResultSection = "Content" | "Products";

interface DirectResult {
  readonly section: DirectResultSection;
  readonly title: string;
  readonly url: string;
}

interface SearchAutocompleteScenario {
  readonly directResults: readonly DirectResult[];
  readonly keywordQuery?: string;
  readonly keywordSuggestions: readonly string[];
}

const scenarios = new WeakMap<Page, SearchAutocompleteScenario>();
const selectedResultUrls = new WeakMap<Page, string>();

const updateScenario = (
  page: Page,
  update: Partial<SearchAutocompleteScenario>
): SearchAutocompleteScenario => {
  const current = scenarios.get(page);
  const scenario = {
    directResults: update.directResults ?? current?.directResults ?? [],
    keywordQuery: update.keywordQuery ?? current?.keywordQuery,
    keywordSuggestions:
      update.keywordSuggestions ?? current?.keywordSuggestions ?? [],
  };
  scenarios.set(page, scenario);
  return scenario;
};

const requireScenario = (page: Page): SearchAutocompleteScenario => {
  const scenario = scenarios.get(page);
  if (scenario === undefined) {
    throw new Error("The scenario does not define search autocomplete data");
  }
  return scenario;
};

const directResultsFrom = (dataTable: DataTable): readonly DirectResult[] => {
  const [headers, ...rows] = dataTable.raw();
  const expectedHeaders = ["Section", "Result", "URL"];
  if (headers?.join("|") !== expectedHeaders.join("|")) {
    throw new Error(
      `Expected autocomplete fields ${expectedHeaders.join(", ")}`
    );
  }
  return rows.map(([section, title, url]) => {
    if (
      (section !== "Content" && section !== "Products") ||
      title === undefined ||
      url === undefined
    ) {
      throw new Error(
        "Every direct result must define a Section, Result, and URL"
      );
    }
    return { section, title, url };
  });
};

const section = (page: Page, name: string) => {
  let sourceId: string | undefined;
  if (name === "Content") {
    sourceId = "content";
  } else if (name === "Products") {
    sourceId = "products";
  } else if (name === "Keywords") {
    sourceId = "querySuggestionsPlugin";
  }
  if (sourceId === undefined) {
    throw new Error(`Unknown autocomplete section ${name}`);
  }
  return page.locator(`[data-autocomplete-source-id="${sourceId}"]`);
};

const escapedPattern = (value: string): RegExp =>
  new RegExp(value.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u");

Given(
  "search autocomplete has these direct results:",
  ({ page }, dataTable: DataTable) => {
    updateScenario(page, { directResults: directResultsFrom(dataTable) });
  }
);

Given(
  "the Search provider returns these keyword suggestions for {string}:",
  ({ page }, query: string, dataTable: DataTable) => {
    const [headers, ...rows] = dataTable.raw();
    if (headers?.join("|") !== "Keyword") {
      throw new Error("Expected one Keyword field");
    }
    const suggestions = rows.map(([suggestion]) => {
      if (suggestion === undefined) {
        throw new Error("Every keyword suggestion must have text");
      }
      return suggestion;
    });
    updateScenario(page, {
      keywordQuery: query,
      keywordSuggestions: suggestions,
    });
  }
);

When(
  "a visitor enters {string} in the header search",
  async ({ page }, query: string) => {
    const { locale } = requireSearchStore(page);
    if (locale !== "en-US") {
      throw new Error("Search autocomplete scenarios currently cover English");
    }
    await page.goto("/products");
    const searchbox = page.getByRole("searchbox", {
      name: "Search",
    });
    await searchbox.fill(query);
    await expect(
      page.locator("[data-autocomplete-section]").first()
    ).toBeVisible();
  }
);

Then(
  "the autocomplete shows these sections in order:",
  async ({ page }, dataTable: DataTable) => {
    const [, ...rows] = dataTable.raw();
    const expectedSections = rows.flatMap(([name]) =>
      name === undefined ? [] : [name]
    );
    await expect(page.locator("[data-autocomplete-section]")).toHaveText(
      expectedSections
    );
  }
);

Then(
  "the autocomplete offers these results:",
  async ({ page }, dataTable: DataTable) => {
    const [, ...rows] = dataTable.raw();
    for (const [sectionName, result] of rows) {
      if (sectionName === undefined || result === undefined) {
        throw new Error("Every autocomplete result must define its section");
      }
      // oxlint-disable-next-line no-await-in-loop -- Results are scoped by section so failures identify the broken source.
      await expect(
        section(page, sectionName).getByRole("link", {
          name: escapedPattern(result),
        })
      ).toBeVisible();
    }
  }
);

Then("Content and Product results link to their pages", async ({ page }) => {
  const scenario = requireScenario(page);
  for (const result of scenario.directResults) {
    // oxlint-disable-next-line no-await-in-loop -- Every direct result carries an independent provider-owned destination.
    await expect(
      section(page, result.section).getByRole("link", {
        name: escapedPattern(result.title),
      })
    ).toHaveAttribute("href", result.url);
  }
});

When(
  "the visitor chooses {string} from the {string} autocomplete section",
  async ({ page }, resultTitle: string, sectionName: string) => {
    const directResult = requireScenario(page).directResults.find(
      (result) => result.section === sectionName && result.title === resultTitle
    );
    if (directResult !== undefined) {
      selectedResultUrls.set(page, directResult.url);
    }
    await section(page, sectionName)
      .getByRole("link", { name: escapedPattern(resultTitle) })
      .click();
  }
);

When(
  "the visitor chooses the exactly typed keyword from autocomplete",
  async ({ page }) => {
    const query = requireScenario(page).keywordQuery;
    if (query === undefined) {
      throw new Error("No typed keyword was defined for autocomplete");
    }
    await section(page, "Keywords")
      .getByRole("link", {
        name: escapedPattern(`Search for "${query}"`),
      })
      .click();
  }
);

Then("the browser opens the selected result page", async ({ page }) => {
  const expectedUrl = selectedResultUrls.get(page);
  if (expectedUrl === undefined) {
    throw new Error("No direct autocomplete result was selected");
  }
  await expect.poll(() => new URL(page.url()).pathname).toBe(expectedUrl);
});

Then(
  "the Search Page opens with query {string}",
  async ({ page }, query: string) => {
    await expect
      .poll(() => {
        const url = new URL(page.url());
        return {
          pathname: url.pathname,
          query: url.searchParams.get("q"),
        };
      })
      .toStrictEqual({ pathname: "/search", query });
    await expect(
      page.getByRole("heading", { level: 1, name: "Products and Resources" })
    ).toBeVisible();
  }
);
