import { createCanonicalContentSearchProjection } from "@repo/search/content-search-projection";
import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

import {
  createAlgoliaIndexGraph,
  createAlgoliaSearchIndices,
} from "./index-graph";
import { createAlgoliaSearchProvider } from "./provider";
import type { AlgoliaSearchProviderOptions } from "./provider";

describe("Content-only search", () => {
  it("provisions locale-isolated Content suggestions without Commerce Stores", () => {
    const projection = createCanonicalContentSearchProjection("content");
    const graph = Effect.runSync(
      createAlgoliaIndexGraph(undefined, ["en-US", "fr-CA"], projection)
    );
    expect(graph.productPrimaries).toEqual([]);
    expect(graph.queryableIndexNames).toEqual([
      "content",
      "query-suggestions--en-US",
      "query-suggestions--fr-CA",
    ]);
    const indices = createAlgoliaSearchIndices(undefined);
    for (const suggestions of graph.querySuggestions) {
      expect(suggestions.indexName).toBe(
        indices.querySuggestions({ locale: suggestions.locale })
      );
      expect(suggestions.sources).toEqual([
        {
          analyticsTags: [`locale:${suggestions.locale.toLowerCase()}`],
          indexName: "content",
        },
      ]);
    }
  });

  it("searches Content and suggestions with only a locale and rejects absent Product indices before sending a request", async () => {
    const search = vi
      .fn<AlgoliaSearchProviderOptions["client"]["search"]>()
      .mockResolvedValue({ results: [] });
    const provider = createAlgoliaSearchProvider({
      client: { search },
      contentProjection: createCanonicalContentSearchProjection("content"),
      indices: createAlgoliaSearchIndices(undefined),
    });
    await expect(
      provider.search([{ indexName: "products", params: {} }], {
        locale: "fr-CA",
      })
    ).rejects.toThrow("not installed");
    expect(search).not.toHaveBeenCalled();
    search.mockResolvedValue({ results: [{ hits: [] }, { hits: [] }] });
    await provider.search(
      [
        { indexName: "content", params: { query: "guide" } },
        { indexName: "query-suggestions", params: { query: "guide" } },
      ],
      { locale: "fr-CA" }
    );
    expect(search).toHaveBeenCalledWith({
      requests: [
        expect.objectContaining({
          filters: 'locales:"fr-CA"',
          indexName: "content",
          query: "guide",
        }),
        expect.objectContaining({
          indexName: "query-suggestions--fr-CA",
          query: "guide",
        }),
      ],
    });
  });
});
