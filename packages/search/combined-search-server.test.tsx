// @vitest-environment node

import { describe, expect, it } from "vitest";

import { getCombinedSearchServerState } from "./combined-search-server";
import type { SearchBatch, SearchProvider } from "./contract";

const audience = {
  locale: "en-US",
  product: {
    currency: "USD",
    priceAudienceIds: ["public"],
    storeKey: "default-store",
  },
} as const;

const createProvider = (received: SearchBatch[]): SearchProvider => ({
  // oxlint-disable-next-line eslint/require-await -- The fake preserves the asynchronous provider interface with deterministic results.
  search: async (batch) => {
    received.push(batch);
    return {
      results: batch.map(({ indexName, params }) => ({
        hits: [],
        hitsPerPage: params.hitsPerPage ?? 6,
        index: indexName,
        nbHits: 0,
        nbPages: 0,
        page: params.page ?? 0,
        processingTimeMS: 1,
        query: params.query ?? "",
      })),
    };
  },
});

describe(getCombinedSearchServerState, () => {
  it("forwards Product and Resource previews in one provider batch", async () => {
    const received: SearchBatch[] = [];

    const serverState = await getCombinedSearchServerState({
      audience,
      provider: createProvider(received),
      routeState: { q: "excavator" },
      tab: "all",
    });

    expect(received).toHaveLength(1);
    expect(received[0]?.map(({ indexName }) => indexName)).toStrictEqual([
      "products",
      "content",
    ]);
    expect(received[0]?.map(({ params }) => params.query)).toStrictEqual([
      "excavator",
      "excavator",
    ]);
    expect(serverState.initialResults.products).toBeDefined();
    expect(serverState.initialResults.content).toBeDefined();
  });

  it("requests only Resources for the focused Resource tab", async () => {
    const received: SearchBatch[] = [];

    const serverState = await getCombinedSearchServerState({
      audience: { locale: "en-US" },
      provider: createProvider(received),
      routeState: { page: "2", q: "excavator", tab: "resources" },
      tab: "resources",
    });

    expect(received).toHaveLength(1);
    expect(received[0]?.map(({ indexName }) => indexName)).toStrictEqual([
      "content",
    ]);
    expect(received[0]?.[0]?.params.page).toBe(1);
    expect(serverState.initialResults.content).toBeDefined();
  });
});
