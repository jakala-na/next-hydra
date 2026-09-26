import { getPathname } from "@repo/i18n/navigation";
import { describe, expect, it } from "vitest";

import {
  createContentIndexingHandoff,
  createDrupalSearchProjection,
} from "./search";

describe(createDrupalSearchProjection, () => {
  it("provides the Drupal Search API handoff for the provisioned index", () => {
    const handoff = createContentIndexingHandoff("acceptance--content");

    expect(handoff.instructions.join("\n")).toContain(
      'ALGOLIA_CONTENT_INDEX_NAME="acceptance--content"'
    );
    expect(handoff.instructions.join("\n")).toContain(
      "drush search-api:rebuild-tracker content"
    );
    expect(handoff.instructions.join("\n")).toContain(
      "drush search-api:index content"
    );
    expect(handoff.instructions.join("\n")).toContain(
      "New Content saves are indexed directly"
    );
    expect(handoff.instructions.join("\n")).toContain("Drupal cron");
  });

  it("describes Drupal Search API's flat Content index", () => {
    const projection = createDrupalSearchProjection("acceptance--content");

    expect({
      filters: projection.filters({ locale: "pt-PT" }),
      indexName: projection.indexName({ locale: "pt-PT" }),
      searchableFields: projection.searchableAttributes(["en-US", "pt-PT"]),
    }).toEqual({
      filters: [{ attribute: "search_api_language", values: ["pt-pt"] }],
      indexName: "acceptance--content",
      searchableFields: [
        { attribute: "title", ordered: true },
        { attribute: "summary", ordered: false },
      ],
    });
  });

  it("normalizes a Drupal Search API record at the CMS boundary", () => {
    const projection = createDrupalSearchProjection("acceptance--content");
    const record = {
      content_type: "article",
      id: "217995f4-bf92-49e5-9785-49d92a5e4256",
      objectID: "entity:node/7:en",
      path: "https://cms.example.com/articles/compact-excavator?preview=0",
      summary: "A guide to compact equipment",
      title: "Choosing a compact excavator",
    };

    expect(projection.toContentSearchHit(record, { locale: "en-US" })).toEqual({
      contentCard: {
        contentType: "article",
        id: "217995f4-bf92-49e5-9785-49d92a5e4256",
        path: "/articles/compact-excavator?preview=0",
        summary: "A guide to compact equipment",
        title: "Choosing a compact excavator",
      },
      objectID: "entity:node/7:en",
    });
  });

  it("accepts Content without a summary", () => {
    const projection = createDrupalSearchProjection("acceptance--content");
    const record = {
      content_type: "landing_page",
      id: "2f08ddbd-32d8-4097-8941-5691240bd36a",
      objectID: "entity:node/8:en",
      path: "/collection",
      title: "Collection",
    };

    expect(
      projection.toContentSearchHit(record, { locale: "en-US" })
    ).toMatchObject({ contentCard: { summary: "" } });
  });

  it.each([
    ["/fr-FR/homepage", "/fr-FR/homepage"],
    [
      "https://cms.example.com/fr-FR/homepage?preview=0#intro",
      "/fr-FR/homepage?preview=0#intro",
    ],
    ["/homepage", "/fr-FR/homepage"],
    ["/fr-FR", "/fr-FR"],
    ["/fr-FR?preview=0#intro", "/fr-FR?preview=0#intro"],
    ["/fr-FR-guide", "/fr-FR/fr-FR-guide"],
  ])("localizes indexed Content path %s exactly once", (path, destination) => {
    const projection = createDrupalSearchProjection("acceptance--content");
    const record = {
      content_type: "landing_page",
      id: "2f08ddbd-32d8-4097-8941-5691240bd36a",
      objectID: "entity:node/8:fr",
      path,
      title: "Accueil",
    };
    const hit = projection.toContentSearchHit(record, { locale: "fr-FR" });

    expect(getPathname({ href: hit.contentCard.path, locale: "fr-FR" })).toBe(
      destination
    );
  });
});
