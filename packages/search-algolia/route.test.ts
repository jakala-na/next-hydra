import { createCanonicalContentSearchProjection } from "@repo/search/content-search-projection";
import { createSearchRouteHandler } from "@repo/search/server";
import type { SearchRouteDependencies } from "@repo/search/server";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { createAlgoliaSearchProvider } from "./product-provider";
import type { AlgoliaSearchProviderOptions } from "./provider";

const audience = {
  locale: "en-US",
  product: {
    currency: "USD",
    priceAudienceIds: ["contractors-id"],
    storeKey: "default-store",
  },
} as const;

const expectedAudienceFilter = 'priceAudienceIds:"contractors-id"';

const localizedIndex =
  (baseName: string) => (searchAudience: { readonly locale: string }) =>
    `${baseName}_${searchAudience.locale}`;

const externalSearchRequestSchema = z.object({
  requests: z.array(
    z
      .object({
        filters: z.string().optional(),
        hitsPerPage: z.number().optional(),
        indexName: z.string(),
        page: z.number().optional(),
        query: z.string().optional(),
      })
      .passthrough()
  ),
});

describe("Algolia search proxy", () => {
  it("applies the resolved audience and returns normalized logical results", async () => {
    const records = [
      {
        availability: "in-stock" as const,
        categories: [{ key: "excavators", label: { "en-US": "Excavators" } }],
        category: { "en-US": ["excavators"] },
        objectID: "authorized-product",
        price: { USD: 12_500 },
        priceAudienceIds: ["contractors-id"],
        productCard: {
          availableForSale: true,
          id: "product-1",
          slug: { "en-US": "compact-excavator" },
          startingPrice: {
            USD: {
              centAmount: 1_250_000,
              currencyCode: "USD",
            },
          },
          title: { "en-US": "Compact Excavator" },
        },
      },
      {
        availability: "in-stock" as const,
        categories: [{ key: "loaders", label: { "en-US": "Loaders" } }],
        category: { "en-US": ["loaders"] },
        objectID: "other-audience-product",
        price: { USD: 18_000 },
        priceAudienceIds: ["retail-id"],
        productCard: {
          availableForSale: true,
          id: "product-2",
          slug: { "en-US": "wheel-loader" },
          startingPrice: {
            USD: {
              centAmount: 1_800_000,
              currencyCode: "USD",
            },
          },
          title: { "en-US": "Wheel Loader" },
        },
      },
    ];
    const search = vi
      .fn<AlgoliaSearchProviderOptions["client"]["search"]>()
      .mockImplementation(async (input) => {
        const { requests } =
          await externalSearchRequestSchema.parseAsync(input);
        return {
          results: requests.map((request) => ({
            hits:
              request.filters === expectedAudienceFilter
                ? records.filter((record) =>
                    audience.product.priceAudienceIds.some((value) =>
                      record.priceAudienceIds.includes(value)
                    )
                  )
                : records,
            hitsPerPage: request.hitsPerPage ?? 20,
            index: request.indexName,
            nbHits: request.filters === expectedAudienceFilter ? 1 : 2,
            nbPages: 1,
            page: request.page ?? 0,
            processingTimeMS: 1,
            query: request.query ?? "",
          })),
        };
      });
    const provider = createAlgoliaSearchProvider({
      client: { search },
      contentProjection: createCanonicalContentSearchProjection("content"),
      indices: {
        priceAscending: localizedIndex("catalog_price_asc"),
        priceDescending: localizedIndex("catalog_price_desc"),
        products: localizedIndex("catalog"),
        querySuggestions: localizedIndex("query_suggestions"),
      },
      priceCustomerGroupIds: ["contractors-id", "retail-id"],
    });
    const resolveAudience = vi
      .fn<SearchRouteDependencies["resolveAudience"]>()
      .mockResolvedValue(audience);
    const handler = createSearchRouteHandler({
      provider,
      resolveAudience,
    });

    const response = await handler(
      new Request("https://shop.example.test/api/search/en-US", {
        body: JSON.stringify({
          requests: [
            {
              indexName: "products",
              params: { hitsPerPage: 12, query: "excavator" },
            },
          ],
        }),
        method: "POST",
      })
    );
    const payload: unknown = await response.json();

    expect(response.status).toBe(200);
    expect(search).toHaveBeenCalledWith({
      requests: [
        expect.objectContaining({
          filters: expectedAudienceFilter,
          indexName: "catalog_en-US",
        }),
      ],
    });
    expect(payload).toMatchObject({
      results: [
        {
          hits: [
            {
              categories: [{ key: "excavators", label: "Excavators" }],
              objectID: "authorized-product",
              productCard: {
                id: "product-1",
                title: "Compact Excavator",
              },
            },
          ],
          index: "products",
          nbHits: 1,
        },
      ],
    });
    expect(JSON.stringify(payload)).not.toContain("other-audience-product");
  });
});
