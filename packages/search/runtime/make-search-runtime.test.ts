import { describe, expect, it, vi } from "vitest";

import type { SearchProvider } from "../contract";
import { makeSearchRuntime } from "./make-search-runtime";

describe(makeSearchRuntime, () => {
  it("resolves the Store audience for a standalone keyword-suggestions request", async () => {
    const audience = {
      locale: "en-US",
      product: {
        currency: "USD",
        priceAudienceIds: ["public"],
        storeKey: "default-store",
      },
    } as const;
    const resolveProductAudience = vi
      .fn<(locale: string) => Promise<typeof audience>>()
      .mockResolvedValue(audience);
    const runtime = makeSearchRuntime({
      getClientConfiguration: () => ({
        autocompleteRoutes: {
          contentPathPrefix: "/",
          productPathPrefix: "/product",
          searchPath: "/search",
        },
        endpoint: "/api/search/en-US",
        productListingPath: "/products",
      }),
      provider: { search: vi.fn<SearchProvider["search"]>() },
      resolveProductAudience,
    });

    const resolved = await runtime.resolveAudience("en-US", [
      {
        indexName: "query-suggestions",
        params: { hitsPerPage: 4, query: "excavator" },
      },
    ]);

    expect(resolved).toBe(audience);
    expect(resolveProductAudience).toHaveBeenCalledExactlyOnceWith("en-US");
  });
});
