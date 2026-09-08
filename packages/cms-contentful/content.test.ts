import { describe, expect, it } from "vitest";

import type { ContentfulArticle, ContentfulLandingPage } from "./content";
import {
  CONTENTFUL_PAGE_QUERY,
  contentfulPageFrom,
  normalizeContentfulSlug,
} from "./content";

describe("Contentful page query", () => {
  it("queries every starter page and component content type", () => {
    for (const contentType of [
      "Article",
      "DynamicProductCollection",
      "FeaturedArticles",
      "Hero",
      "LandingPage",
    ]) {
      expect(CONTENTFUL_PAGE_QUERY).toContain(
        contentType === "Article" || contentType === "LandingPage"
          ? `${contentType.toLowerCase().replaceAll("landingpage", "landingPage")}Collection`
          : `... on ${contentType}`
      );
    }
    expect(CONTENTFUL_PAGE_QUERY).toContain("internalContent");
  });

  it("normalizes route paths into Contentful slugs", () => {
    expect(normalizeContentfulSlug("//equipment/")).toBe("equipment");
  });

  it("returns landing pages and articles from their route collections", () => {
    const landingPage = {
      __typename: "LandingPage",
      componentsCollection: { items: [] },
      slug: "equipment",
      sys: { id: "landing-page" },
      title: "Equipment",
    } satisfies ContentfulLandingPage;

    expect(
      contentfulPageFrom({
        articleCollection: { items: [] },
        landingPageCollection: { items: [landingPage] },
      })
    ).toBe(landingPage);

    const article = {
      __typename: "Article",
      slug: "choosing-an-excavator",
      summary: "A practical guide",
      sys: { id: "article" },
      title: "Choosing an excavator",
    } satisfies ContentfulArticle;

    expect(
      contentfulPageFrom({
        articleCollection: { items: [article] },
        landingPageCollection: { items: [] },
      })
    ).toBe(article);
  });
});
