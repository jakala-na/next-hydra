import { storeConfiguration } from "@repo/commerce/store";
import {
  createCanonicalContentSearchProjection,
  defineContentSearchProjection,
} from "@repo/search/content-search-projection";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import {
  createAlgoliaIndexGraph,
  createAlgoliaSearchIndices,
} from "./index-graph";

const contentProjection = (deployment: string) =>
  createCanonicalContentSearchProjection(`${deployment}--content`);

describe(createAlgoliaIndexGraph, () => {
  it("uses base index names when the prefix is empty", () => {
    const graph = Effect.runSync(
      createAlgoliaIndexGraph(
        "",
        ["en-US"],
        createCanonicalContentSearchProjection("content")
      )
    );

    expect({
      content: graph.contentIndices[0]?.indexName,
      primary: graph.productPrimaries[0]?.indexName,
      querySuggestions: graph.querySuggestions[0]?.indexName,
      sources: graph.querySuggestions[0]?.sources,
    }).toEqual({
      content: "content",
      primary: "products--default-store",
      querySuggestions: "query-suggestions--default-store--en-US",
      sources: [
        {
          analyticsTags: ["locale:en-us"],
          indexName: "products--default-store",
        },
        { analyticsTags: ["locale:en-us"], indexName: "content" },
      ],
    });
  });

  it("derives every Store and locale from the domain configuration", () => {
    const graph = Effect.runSync(
      createAlgoliaIndexGraph(
        "development",
        storeConfiguration.map(({ locale }) => locale),
        contentProjection("development")
      )
    );
    const storeKeys = new Set(
      storeConfiguration.map(({ storeKey }) => storeKey)
    );
    const storeCurrencies = new Set(
      storeConfiguration.map(
        ({ currency, storeKey }) => `${storeKey}\u0000${currency}`
      )
    );
    expect({
      contentIndexName: graph.contentIndices[0]?.indexName,
      firstSuggestionSources: graph.querySuggestions[0]?.sources,
      primaryCount: graph.productPrimaries.length,
      queryableCount: graph.queryableIndexNames.length,
      replicaCount: graph.productPrimaries.flatMap(({ replicas }) => replicas)
        .length,
      suggestionCount: graph.querySuggestions.length,
    }).toEqual({
      contentIndexName: "development--content",
      firstSuggestionSources: [
        {
          analyticsTags: [
            `environment:development|locale:${storeConfiguration[0]?.locale.toLowerCase()}`,
          ],
          indexName: `development--products--${storeConfiguration[0]?.storeKey}`,
        },
        {
          analyticsTags: [
            `environment:development|locale:${storeConfiguration[0]?.locale.toLowerCase()}`,
          ],
          indexName: "development--content",
        },
      ],
      primaryCount: storeKeys.size,
      queryableCount:
        storeKeys.size +
        storeCurrencies.size * 2 +
        storeConfiguration.length +
        1,
      replicaCount: storeCurrencies.size * 2,
      suggestionCount: storeConfiguration.length,
    });
  });

  it("uses the same Store, locale, and currency topology as runtime resolution", () => {
    const [storefront] = storeConfiguration;
    if (storefront === undefined) {
      throw new Error("Expected at least one configured Store");
    }
    const graph = Effect.runSync(
      createAlgoliaIndexGraph(
        "preview",
        [storefront.locale],
        contentProjection("preview")
      )
    );
    const audience = {
      locale: storefront.locale,
      product: {
        currency: storefront.currency,
        priceAudienceIds: ["public"],
        storeKey: storefront.storeKey,
      },
    };
    const runtime = createAlgoliaSearchIndices("preview");
    const [suggestions] = graph.querySuggestions;

    expect(runtime.products(audience)).toBe(suggestions?.sources[0]?.indexName);
    expect(runtime.priceAscending(audience)).toBe(
      graph.productPrimaries[0]?.replicas.find(
        ({ currency, sort }) =>
          currency === storefront.currency && sort === "price-asc"
      )?.indexName
    );
    expect(contentProjection("preview").indexName(audience)).toBe(
      suggestions?.sources[1]?.indexName
    );
    expect(runtime.querySuggestions(audience)).toBe(suggestions?.indexName);
    expect(contentProjection("preview").indexName(audience)).toBe(
      graph.contentIndices[0]?.indexName
    );
  });

  it("uses nine physical indices for two Store and locale pairs", () => {
    const graph = Effect.runSync(
      createAlgoliaIndexGraph(
        "demo",
        ["en-US", "de-DE"],
        contentProjection("demo")
      )
    );

    expect(graph.queryableIndexNames).toHaveLength(9);
  });

  it("provisions each distinct CMS-selected Content index once", () => {
    const canonicalProjection = contentProjection("demo");
    const localeSpecificProjection = defineContentSearchProjection({
      ...canonicalProjection,
      indexName: ({ locale }) => `demo--content--${locale}`,
    });
    const graph = Effect.runSync(
      createAlgoliaIndexGraph(
        "demo",
        ["en-US", "de-DE"],
        localeSpecificProjection
      )
    );

    expect(graph.contentIndices).toEqual([
      { indexName: "demo--content--en-US", locales: ["en-US"] },
      { indexName: "demo--content--de-DE", locales: ["de-DE"] },
    ]);
    expect(
      graph.querySuggestions.map(({ locale, sources }) => ({
        contentSource: sources[1]?.indexName,
        locale,
      }))
    ).toEqual([
      { contentSource: "demo--content--en-US", locale: "en-US" },
      { contentSource: "demo--content--de-DE", locale: "de-DE" },
    ]);
    expect(graph.queryableIndexNames).toHaveLength(10);
  });

  it("rejects a locale requested more than once", () => {
    const [storefront] = storeConfiguration;
    if (storefront === undefined) {
      throw new Error("Expected at least one configured Store");
    }

    const error = Effect.runSync(
      createAlgoliaIndexGraph(
        "development",
        [storefront.locale, storefront.locale],
        contentProjection("development")
      ).pipe(Effect.flip)
    );
    expect(error).toMatchObject({ reason: "duplicate-locale" });
  });

  it("returns a typed failure for an invalid index prefix", () => {
    const error = Effect.runSync(
      createAlgoliaIndexGraph(
        "invalid--prefix",
        ["en-US"],
        contentProjection("invalid")
      ).pipe(Effect.flip)
    );

    expect(error).toMatchObject({
      _tag: "AlgoliaProvisioningInputError",
      reason: "invalid-segment",
    });
  });

  it("rejects ambiguous duplicate Store and locale pairs", () => {
    const [storefront] = storeConfiguration;
    if (storefront === undefined) {
      throw new Error("Expected at least one configured Store");
    }

    const error = Effect.runSync(
      createAlgoliaIndexGraph(
        "development",
        [storefront.locale],
        contentProjection("development"),
        [storefront, storefront]
      ).pipe(Effect.flip)
    );
    expect(error).toMatchObject({ reason: "duplicate-storefront" });
  });

  it("maps a locale without a Store mapping to the default English Store", () => {
    const graph = Effect.runSync(
      createAlgoliaIndexGraph(
        "development",
        ["fr-CA"],
        contentProjection("development")
      )
    );

    expect(graph.productPrimaries).toEqual([
      expect.objectContaining({
        indexName: "development--products--default-store",
        storefronts: [{ currency: "USD", locale: "en-US" }],
      }),
    ]);
    expect(graph.querySuggestions).toEqual([
      expect.objectContaining({
        indexName: "development--query-suggestions--default-store--fr-CA",
        locale: "fr-CA",
      }),
    ]);
    expect(graph.contentIndices).toEqual([
      { indexName: "development--content", locales: ["fr-CA"] },
    ]);
  });
});
