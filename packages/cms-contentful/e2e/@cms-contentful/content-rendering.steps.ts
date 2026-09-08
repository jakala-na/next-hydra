import { Given, Then, When } from "@repo/e2e-testing";
import type { DataTable, Page } from "@repo/e2e-testing";

import { ContentfulContentRenderingDriver } from "../drivers/content-rendering.driver";

type ContentBlock = {
  readonly heading: string;
  readonly type: string;
};

type ContentfulScenario = {
  articleTitle?: string;
  blocks?: readonly ContentBlock[];
  displayTitle?: string;
  heroAction?: string;
  heroHeading?: string;
  locale?: string;
  slug?: string;
};

const scenarios = new WeakMap<Page, ContentfulScenario>();
const driver = (page: Page) => new ContentfulContentRenderingDriver(page);

const scenarioFor = (page: Page): ContentfulScenario => {
  const scenario = scenarios.get(page);
  if (!scenario) {
    throw new Error("The Contentful rendering scenario has not been prepared");
  }
  return scenario;
};

const slugFromTitle = (title: string) =>
  title
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, "-")
    .replaceAll(/^-|-$/gu, "");

const contentBlockFrom = (row: Record<string, string>): ContentBlock => {
  const heading = row.Heading;
  const type = row.Block;
  if (!(heading && type)) {
    throw new Error("Each Contentful block requires a Block and Heading");
  }
  return { heading, type };
};

Given(
  "Contentful has a published landing page for locale {string} with:",
  ({ page }, locale: string, dataTable: DataTable) => {
    const fields = dataTable.rowsHash();
    scenarios.set(page, {
      displayTitle: fields["Display title"],
      locale,
      slug: fields.Slug,
    });
  }
);

Given(
  "the Contentful landing page contains these blocks in order:",
  ({ page }, dataTable: DataTable) => {
    const scenario = scenarioFor(page);
    const blocks = dataTable.hashes().map(contentBlockFrom);
    scenarios.set(page, {
      ...scenario,
      blocks,
      heroHeading: blocks.find(({ type }) => type === "Hero")?.heading,
    });
  }
);

Given(
  "the Contentful hero has an internal action {string} to article {string}",
  ({ page }, action: string, articleTitle: string) => {
    scenarios.set(page, {
      ...scenarioFor(page),
      articleTitle,
      heroAction: action,
    });
  }
);

Given(
  "the Contentful featured articles include {string}",
  ({ page }, articleTitle: string) => {
    scenarios.set(page, {
      ...scenarioFor(page),
      articleTitle,
    });
  }
);

When(
  "a visitor opens the Contentful landing page {string} in locale {string}",
  async ({ page }, slug: string, locale: string) => {
    await driver(page).open(slug, locale);
  }
);

Then(
  "the landing page displays the title {string}",
  async ({ page }, title: string) => {
    await driver(page).expectLandingTitle(title);
  }
);

Then(
  "the Contentful blocks are displayed in their configured order",
  async ({ page }) => {
    const { blocks } = scenarioFor(page);
    if (!blocks) {
      throw new Error("The Contentful scenario does not define content blocks");
    }
    await driver(page).expectBlocksInOrder(blocks);
  }
);

Then(
  "the hero displays its tagline, description, image, and {string} action",
  async ({ page }, action: string) => {
    const { heroHeading } = scenarioFor(page);
    if (!heroHeading) {
      throw new Error("The Contentful scenario does not define a hero");
    }
    await driver(page).expectHero(heroHeading, action);
  }
);

Then(
  "featured articles displays the {string} article",
  async ({ page }, articleTitle: string) => {
    const { blocks } = scenarioFor(page);
    const heading = blocks?.find(
      ({ type }) => type === "Featured Articles"
    )?.heading;
    if (!heading) {
      throw new Error(
        "The Contentful scenario does not define featured articles"
      );
    }
    await driver(page).expectFeaturedArticle(heading, articleTitle);
  }
);

Then(
  "the product collection displays the heading {string}",
  async ({ page }, heading: string) => {
    await driver(page).expectProductCollection(heading);
  }
);

Given(
  "Contentful has a published article {string} for locale {string}",
  ({ page }, articleTitle: string, locale: string) => {
    scenarios.set(page, { articleTitle, locale });
  }
);

When(
  "a visitor opens the Contentful article {string} in locale {string}",
  async ({ page }, title: string, locale: string) => {
    await driver(page).open(slugFromTitle(title), locale);
  }
);

Then(
  "the article displays its title, summary, image, and publication date",
  async ({ page }) => {
    const { articleTitle } = scenarioFor(page);
    if (!articleTitle) {
      throw new Error("The Contentful scenario does not define an article");
    }
    await driver(page).expectArticle(articleTitle);
  }
);

Then("the article displays its rich text body", async ({ page }) => {
  await driver(page).expectRichTextBody();
});
