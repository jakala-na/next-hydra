import { describe, expect, it } from "vitest";

import {
  createContentstackSearch,
  createContentstackSearchProjection,
} from "../../search-provider";
import { landingPageSearchType } from "./landing-page";
import { productCollectionSearchInstructions } from "./product-collection";
import { resolveSearchContentTypes } from "./types";

describe("Commerce content search recipe", () => {
  it("extends the existing page guide without inventing a product content type or another sync", () => {
    const contentTypes = resolveSearchContentTypes([
      productCollectionSearchInstructions,
      landingPageSearchType,
    ]);
    expect(contentTypes.map(({ uid }) => uid)).toEqual(["landing_page"]);
    const projection = createContentstackSearchProjection({
      contentTypes,
      branch: "main",
      environment: "production",
      indexName: "content",
    });
    expect(projection.searchableAttributes(["fr-CA"])).toEqual([
      { attribute: "landing_pages.fr-CA", ordered: true },
    ]);
    const { tasks } =
      createContentstackSearch(contentTypes).createContentIndexingHandoff(
        "content"
      );
    expect(
      tasks.find(({ id }) => id === "cms.contentstack.review.landing_page")
        ?.detail
    ).toContain("Commerce category");
    expect(
      tasks.filter(({ id }) => id === "cms.contentstack.initial-sync")
    ).toHaveLength(1);
    const baseTasks = createContentstackSearch([
      landingPageSearchType,
    ]).createContentIndexingHandoff("content").tasks;
    expect(JSON.stringify(baseTasks)).not.toContain("Commerce category");
  });
});
