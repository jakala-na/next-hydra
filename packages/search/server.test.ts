import { describe, expect, it, vi } from "vitest";

import type { SearchProvider } from "./contract";
import { createSearchRouteHandler } from "./server";
import type { SearchRouteDependencies } from "./server";

const audience = {
  locale: "en-US",
  product: {
    currency: "USD",
    customerSegmentKeys: ["public"],
    distributionChannelKeys: ["public"],
    storeKey: "default-store",
    supplyChannelKeys: ["public"],
  },
} as const;

describe(createSearchRouteHandler, () => {
  it("derives the audience and delegates a validated batch", async () => {
    const search = vi.fn<SearchProvider["search"]>().mockResolvedValue({
      results: [],
    });
    const resolveAudience = vi
      .fn<SearchRouteDependencies["resolveAudience"]>()
      .mockResolvedValue(audience);
    const handler = createSearchRouteHandler({
      provider: { search },
      resolveAudience,
    });
    const request = new Request("https://shop.example.test/api/search/en-US", {
      body: JSON.stringify({
        requests: [{ indexName: "products", params: { hitsPerPage: 12 } }],
      }),
      method: "POST",
    });

    const response = await handler(request);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toStrictEqual({ results: [] });
    expect(resolveAudience).toHaveBeenCalledWith(
      [{ indexName: "products", params: { hitsPerPage: 12 } }],
      request
    );
    expect(search).toHaveBeenCalledWith(
      [{ indexName: "products", params: { hitsPerPage: 12 } }],
      audience,
      request.signal
    );
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("rejects raw provider filters before resolving an audience", async () => {
    const resolveAudience = vi
      .fn<SearchRouteDependencies["resolveAudience"]>()
      .mockResolvedValue(audience);
    const handler = createSearchRouteHandler({
      provider: { search: vi.fn<SearchProvider["search"]>() },
      resolveAudience,
    });
    const request = new Request("https://shop.example.test/api/search/en-US", {
      body: JSON.stringify({
        requests: [
          { indexName: "products", params: { filters: "storeKeys:other" } },
        ],
      }),
      method: "POST",
    });

    const response = await handler(request);

    expect(response.status).toBe(400);
    expect(resolveAudience).not.toHaveBeenCalled();
  });
});
