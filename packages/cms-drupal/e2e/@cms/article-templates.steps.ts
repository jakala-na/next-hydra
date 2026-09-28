import { test } from "@repo/e2e-testing";
import type { Page } from "@repo/e2e-testing";
import { createBdd } from "playwright-bdd";

import {
  ArticleTemplateDriver,
  isDrupalSelected,
} from "../article-template-driver";

const { After, Before, Given, Then, When } = createBdd(test);
const scenarios = new WeakMap<Page, ArticleTemplateDriver>();

function scenario(page: Page): ArticleTemplateDriver {
  const driver = scenarios.get(page);
  if (!driver) {
    throw new Error("The article-template scenario was not initialized.");
  }
  return driver;
}

Before({ tags: "@cms and @drupal" }, async ({ page, $testInfo }) => {
  $testInfo.skip(
    !(await isDrupalSelected()),
    "These scenarios exercise the Drupal composition and its local recipe installation."
  );
  $testInfo.setTimeout(120_000);
  scenarios.set(page, new ArticleTemplateDriver(page));
});

After({ tags: "@cms and @drupal" }, async ({ page }) => {
  await scenarios.get(page)?.dispose();
  scenarios.delete(page);
});

Given(
  "the starter articles use the shared article template",
  async ({ page }) => {
    await scenario(page).loadArticles();
  }
);
When("I read two articles and a French translation", async ({ page }) => {
  await scenario(page).readArticles();
});
Then(
  "each article shows its own title, summary, image, and formatted body",
  async ({ page }) => {
    await scenario(page).expectArticleContent();
  }
);
Then(
  "each article has one site header and one site footer",
  async ({ page }) => {
    await scenario(page).expectArticleRegions();
  }
);
When("I preview a new shared article notice", async ({ page }) => {
  await scenario(page).previewNotice();
});
Then("the notice appears in the template preview only", async ({ page }) => {
  await scenario(page).expectNoticePrivate();
});
When("I publish the article template", async ({ page }) => {
  await scenario(page).publishTemplate();
});
Then(
  "both articles show the shared notice without changes to their content",
  async ({ page }) => {
    await scenario(page).expectPublishedNotice();
  }
);
Given("an unpublished article with a French translation", async ({ page }) => {
  await scenario(page).createDraft();
});
When("I preview the French article in Canvas", async ({ page }) => {
  await scenario(page).previewFrenchDraft();
});
Then(
  "I see the translated article through the shared template",
  async ({ page }) => {
    await scenario(page).expectFrenchDraft();
  }
);
Then("visitors cannot read the unpublished article", async ({ page }) => {
  await scenario(page).expectDraftPrivate();
});
