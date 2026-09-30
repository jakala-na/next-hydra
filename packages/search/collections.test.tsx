// @vitest-environment node

import { Effect, Exit } from "effect";
import { describe, expect, it } from "vitest";

import { searchCollections } from "./collections";
import { createCombinedSearchStateMapping } from "./combined-search-routing";
import { getCombinedSearchServerState } from "./combined-search-server";
import type { SearchBatch, SearchProvider } from "./contract";
import { validateSearchBatch } from "./validation";

// Run in source and in composed workspaces, using their actual registry bindings.
const hasProducts = searchCollections.some(
  ({ indexName }) => indexName === "products"
);

describe("composed Search collections", () => {
  it("prerenders All as previews with Commerce or a paged Content collection without it", async () => {
    const received: SearchBatch[] = [];
    const provider: SearchProvider = {
      // oxlint-disable-next-line eslint/require-await -- This faithful provider records transport requests and returns a deterministic empty result page.
      search: async (batch) => {
        received.push(batch);
        return {
          results: batch.map(({ indexName, params }) => ({
            hits: [],
            hitsPerPage: params.hitsPerPage ?? 6,
            index: indexName,
            nbHits: 24,
            nbPages: 4,
            page: params.page ?? 0,
            processingTimeMS: 1,
            query: params.query ?? "",
          })),
        };
      },
    };
    await getCombinedSearchServerState({
      audience: { locale: "en-US" },
      provider,
      routeState: { page: "2", q: "guide" },
      tab: "all",
    });
    expect(received).toHaveLength(1);
    expect(
      received[0]?.map(({ indexName, params }) => ({
        indexName,
        page: params.page ?? 0,
        query: params.query,
      }))
    ).toEqual(
      hasProducts
        ? [
            { indexName: "products", page: 0, query: "guide" },
            { indexName: "content", page: 0, query: "guide" },
          ]
        : [{ indexName: "content", page: 1, query: "guide" }]
    );
  });

  it("preserves the query and only paginates All for a single collection", () => {
    const mapping = createCombinedSearchStateMapping("all");
    const state = mapping.routeToState({ page: "3", q: "guide" });
    expect(state).toEqual(
      hasProducts
        ? { products: { query: "guide" } }
        : { content: { page: 3, query: "guide" } }
    );
    expect(mapping.stateToRoute(state)).toMatchObject(
      hasProducts ? { q: "guide" } : { page: 3, q: "guide" }
    );
  });

  it("only accepts Product queries when that collection is installed", () => {
    const requests = [{ indexName: "products", params: { query: "drill" } }];
    const result = Effect.runSyncExit(
      Effect.try(() => validateSearchBatch({ requests }))
    );
    expect(Exit.isSuccess(result)).toBe(hasProducts);
  });
});
