import { expect } from "@repo/e2e-testing";
import type { Page } from "@repo/e2e-testing";

export class ContentfulContentRenderingDriver {
  readonly #page: Page;

  constructor(page: Page) {
    this.#page = page;
  }

  async open(slug: string, locale: string) {
    const localePrefix = locale === "en-US" ? "" : `/${locale}`;
    await this.#page.goto(`${localePrefix}/${slug}`);
  }

  async expectLandingTitle(title: string) {
    await expect(
      this.#page.getByRole("heading", { level: 1, name: title })
    ).toBeVisible();
  }

  async expectBlocksInOrder(blocks: readonly { heading: string }[]) {
    const positions = await Promise.all(
      blocks.map(async ({ heading }) => {
        const box = await this.#page
          .getByRole("heading", { name: heading })
          .boundingBox();
        if (!box) {
          throw new Error(
            `Contentful block heading "${heading}" is not visible`
          );
        }
        return box.y;
      })
    );

    for (const [index, position] of positions.entries()) {
      const previous = positions[index - 1];
      if (previous !== undefined) {
        expect(position).toBeGreaterThan(previous);
      }
    }
  }

  async expectHero(heading: string, actionLabel: string) {
    const hero = this.#page
      .locator("section")
      .filter({ has: this.#page.getByRole("heading", { name: heading }) });
    await expect(hero).toBeVisible();
    await expect(hero.locator("span")).not.toBeEmpty();
    await expect(
      hero.locator(".text-muted-foreground.text-xl")
    ).not.toBeEmpty();
    await expect(hero.locator("img")).toBeVisible();
    await expect(hero.getByRole("link", { name: actionLabel })).toBeVisible();
  }

  async expectFeaturedArticle(collectionHeading: string, articleTitle: string) {
    const collection = this.#page.locator("section").filter({
      has: this.#page.getByRole("heading", { name: collectionHeading }),
    });
    await expect(
      collection.getByRole("heading", { name: articleTitle })
    ).toBeVisible();
  }

  async expectProductCollection(heading: string) {
    await expect(
      this.#page.getByRole("heading", { name: heading })
    ).toBeVisible();
  }

  async expectArticle(title: string) {
    const article = this.#page.locator("article").first();
    await expect(
      article.getByRole("heading", { level: 1, name: title })
    ).toBeVisible();
    await expect(article.locator("header p")).toHaveCount(2);
    await expect(article.locator("img")).toBeVisible();
  }

  async expectRichTextBody() {
    const body = this.#page.locator("article .prose");
    await expect(body).toBeVisible();
    await expect(body).not.toBeEmpty();
  }
}
