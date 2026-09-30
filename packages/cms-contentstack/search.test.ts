import { ConfigProvider, Effect } from "effect";
import { describe, expect, it } from "vitest";

import {
  createContentIndexingHandoff,
  createContentstackSearchProjection,
  loadContentSearchProjection,
} from "./search";

describe(createContentstackSearchProjection, () => {
  it("provides the Contentstack app handoff for the provisioned index", () => {
    const handoff = createContentIndexingHandoff("acceptance--content");

    expect(handoff.title).toBe("Complete Content indexing in Contentstack");
    expect(handoff.instructions.join("\n")).toContain(
      'destination index to "acceptance--content"'
    );
    expect(handoff.instructions.join("\n")).toContain("initial content sync");
  });

  it("describes the connector's shared localized Content index", () => {
    const projection = createContentstackSearchProjection({
      branch: "preview",
      environment: "development",
      indexName: "acceptance--content",
    });
    const audience = { locale: "en-US" };

    expect({
      filters: projection.filters(audience),
      indexName: projection.indexName(audience),
      restrictedFields: projection.restrictSearchableAttributes?.(audience),
      searchableFields: projection.searchableAttributes(["en-US", "de-DE"]),
    }).toEqual({
      filters: [
        { attribute: "environment", values: ["development"] },
        { attribute: "publish_details.locale", values: ["en-us"] },
      ],
      indexName: "acceptance--content",
      restrictedFields: [
        "articles.preview.en-US",
        "landing_pages.preview.en-US",
      ],
      searchableFields: [
        { attribute: "articles.preview.en-US", ordered: true },
        { attribute: "landing_pages.preview.en-US", ordered: true },
        { attribute: "articles.preview.de-DE", ordered: true },
        { attribute: "landing_pages.preview.de-DE", ordered: true },
      ],
    });
  });

  it("uses the unqualified connector fields for the main branch", () => {
    const projection = createContentstackSearchProjection({
      branch: "main",
      environment: "production",
      indexName: "production--content",
    });

    expect(projection.searchableAttributes(["en-US"])).toEqual([
      { attribute: "articles.en-US", ordered: true },
      { attribute: "landing_pages.en-US", ordered: true },
    ]);
  });

  it("loads Contentstack selectors independently from the Algolia prefix", async () => {
    const projection = await loadContentSearchProjection(
      "acceptance--content",
      Effect.succeed(
        ConfigProvider.fromUnknown({
          CONTENTSTACK_BRANCH: "release-candidate",
          CONTENTSTACK_ENVIRONMENT: "preview",
        })
      )
    ).pipe(Effect.runPromise);

    expect({
      filters: projection.filters({ locale: "en-US" }),
      indexName: projection.indexName({ locale: "en-US" }),
      searchableFields: projection.searchableAttributes(["en-US"]),
    }).toEqual({
      filters: [
        { attribute: "environment", values: ["preview"] },
        { attribute: "publish_details.locale", values: ["en-us"] },
      ],
      indexName: "acceptance--content",
      searchableFields: [
        { attribute: "articles.release-candidate.en-US", ordered: true },
        {
          attribute: "landing_pages.release-candidate.en-US",
          ordered: true,
        },
      ],
    });
  });

  it("normalizes a Contentstack record at the CMS boundary", () => {
    const projection = createContentstackSearchProjection({
      branch: "preview",
      environment: "development",
      indexName: "acceptance--content",
    });
    const record = {
      _content_type: "landing_page",
      content: {
        description: "Discover the collection",
        id: "landing-page-1",
        path: "/collection",
        title: "Collection",
      },
      objectID: "entry-1",
    };

    expect(projection.toContentSearchHit(record, { locale: "en-US" })).toEqual({
      contentCard: {
        contentType: "landing_page",
        id: "landing-page-1",
        path: "/collection",
        summary: "Discover the collection",
        title: "Collection",
      },
      objectID: "entry-1",
    });
  });
});
