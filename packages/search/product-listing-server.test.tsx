// @vitest-environment node

import { describe, expect, it } from "vitest";

import type { SearchBatch, SearchProvider } from "./contract";
import { getProductListingServerState } from "./product-listing-server";

const audience = {
  currency: "USD",
  customerSegmentKeys: ["public"],
  distributionChannelKeys: ["north-america"],
  locale: "en-US",
  storeKey: "default-store",
  supplyChannelKeys: ["main-warehouse"],
} as const;

describe(getProductListingServerState, () => {
  it("forwards InstantSearch's complete disjunctive-facet batch", async () => {
    const received: SearchBatch[] = [];
    const provider: SearchProvider = {
      // oxlint-disable-next-line eslint/require-await -- The fake preserves the production provider's asynchronous contract while returning deterministic results.
      search: async (batch, receivedAudience) => {
        received.push(batch);
        expect(receivedAudience).toBe(audience);
        return {
          results: batch.map(({ indexName, params }) => ({
            facets: {
              availability: { "in-stock": 2, "out-of-stock": 1 },
              category: { excavators: 2, loaders: 1 },
            },
            facets_stats: {
              price: {
                avg: 15_000,
                max: 18_000,
                min: 12_000,
                sum: 45_000,
              },
            },
            hits: [],
            hitsPerPage: params.hitsPerPage ?? 12,
            index: indexName,
            nbHits: 0,
            nbPages: 0,
            page: params.page ?? 0,
            processingTimeMS: 1,
            query: params.query ?? "",
          })),
        };
      },
    };

    const serverState = await getProductListingServerState({
      audience,
      provider,
      routeState: {
        availability: "in-stock",
        category: ["excavators", "loaders"],
        sort: "price-asc",
      },
    });

    expect(received).toHaveLength(1);
    expect(received[0]?.length).toBeGreaterThan(1);
    expect(received[0]?.[0]?.indexName).toBe("products@price-asc");
    expect(serverState.initialResults.products).toBeDefined();
  });
});
