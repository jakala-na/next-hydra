import { ConfigProvider, Effect } from "effect";
import { describe, expect, it } from "vitest";

import { landingPageSearchType } from "./recipe/search/landing-page";
import {
  createContentstackSearch,
  createContentstackSearchProjection,
} from "./search-provider";

const contentTypes = [landingPageSearchType];
const { createContentIndexingHandoff, loadContentSearchProjection } =
  createContentstackSearch(contentTypes);

describe(createContentstackSearchProjection, () => {
  it("omits completed app setup but retains mapping, sync and record verification after installation", () => {
    const handoff = createContentIndexingHandoff("acceptance--content", {
      appInstalled: true,
    });
    expect(handoff.tasks.map(({ id }) => id)).toEqual([
      "cms.contentstack.mapping.landing_page",
      "cms.contentstack.review.landing_page",
      "cms.contentstack.initial-sync",
      "cms.contentstack.verify-records",
    ]);
    expect(handoff.tasks[0]?.detail).toContain(
      "Algolia > acceptance--content > Configuration"
    );
    expect(JSON.stringify(handoff)).not.toMatch(/article/iu);
    expect(handoff.tasks[3]?.where).toContain("acceptance--content");
    expect(handoff.tasks[3]?.detail).toContain("content.path");
  });

  it("provides the Contentstack app handoff for the provisioned index", () => {
    const handoff = createContentIndexingHandoff("acceptance--content");
    const instructions = handoff.tasks.map(({ detail }) => detail).join("\n");

    expect(handoff.title).toBe("Complete Content indexing in Contentstack");
    for (const fragment of [
      'destination index to "acceptance--content"',
      "initial content sync",
      "Searchable attributes",
      "Landing Page (landing_page)",
      "publish_details.locale",
    ]) {
      expect(instructions).toContain(fragment);
    }
  });

  it("describes the connector's shared localized Content index", () => {
    const projection = createContentstackSearchProjection({
      contentTypes,
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
      restrictedFields: ["landing_pages.preview.en-US"],
      searchableFields: [
        { attribute: "landing_pages.preview.en-US", ordered: true },
        { attribute: "landing_pages.preview.de-DE", ordered: true },
      ],
    });
  });

  it("uses the unqualified connector fields for the main branch", () => {
    const projection = createContentstackSearchProjection({
      contentTypes,
      branch: "main",
      environment: "production",
      indexName: "production--content",
    });

    expect(projection.searchableAttributes(["en-US"])).toEqual([
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
        {
          attribute: "landing_pages.release-candidate.en-US",
          ordered: true,
        },
      ],
    });
  });

  it("normalizes a Contentstack record at the CMS boundary", () => {
    const projection = createContentstackSearchProjection({
      contentTypes,
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
