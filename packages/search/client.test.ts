import { hydrateSearchClient } from "instantsearch.js/es/lib/utils";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createProxySearchClient } from "./client";

describe(createProxySearchClient, () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not masquerade as an Algolia client during SSR hydration", () => {
    const client = createProxySearchClient("/api/search/en-US");

    expect(() => {
      hydrateSearchClient(client, {});
    }).not.toThrow();
  });

  it("adapts autocomplete.js requests without forwarding compatibility headers", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(
        {
          results: [
            {
              hits: [],
              hitsPerPage: 4,
              index: "query-suggestions",
              nbHits: 0,
              nbPages: 0,
              page: 0,
              processingTimeMS: 1,
              query: "excavator",
            },
          ],
        },
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);
    const client = createProxySearchClient("/api/search/en-US");
    const legacyAutocompleteRequest = {
      indexName: "query-suggestions",
      params: { hitsPerPage: 4 },
      query: "excavator",
    };

    await client.search([legacyAutocompleteRequest]);

    expect(fetchMock).toHaveBeenCalledWith("/api/search/en-US", {
      body: JSON.stringify({
        requests: [
          {
            indexName: "query-suggestions",
            params: { hitsPerPage: 4, query: "excavator" },
          },
        ],
      }),
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
  });
});
