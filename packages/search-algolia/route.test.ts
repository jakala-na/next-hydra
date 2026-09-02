import { makeSearchRouteHandler } from "@repo/search/server";
import type { SearchRouteDependencies } from "@repo/search/server";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { createAlgoliaSearchProvider } from "./provider";
import type { AlgoliaSearchProviderOptions } from "./provider";

const audience = {
  currency: "USD",
  customerSegmentKeys: ["contractors"],
  distributionChannelKeys: ["north-america"],
  locale: "en-US",
  storeKey: "default-store",
  supplyChannelKeys: ["main-warehouse"],
} as const;

const expectedAudienceFilter =
  'storeKeys:"default-store" AND locales:"en-US" AND currencies:"USD" AND customerSegmentKeys:"contractors" AND distributionChannelKeys:"north-america" AND supplyChannelKeys:"main-warehouse"';

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
        categories: [{ key: "excavators", label: "Excavators" }],
        category: ["excavators"],
        currencies: ["USD"],
        customerSegmentKeys: ["contractors"],
        distributionChannelKeys: ["north-america"],
        locales: ["en-US"],
        objectID: "authorized-product",
        price: 12_500,
        productCard: {
          availableForSale: true,
          id: "product-1",
          slug: "compact-excavator",
          startingPrice: {
            centAmount: 1_250_000,
            currencyCode: "USD",
          },
          title: "Compact Excavator",
        },
        storeKeys: ["default-store"],
        supplyChannelKeys: ["main-warehouse"],
      },
      {
        availability: "in-stock" as const,
        categories: [{ key: "loaders", label: "Loaders" }],
        category: ["loaders"],
        currencies: ["USD"],
        customerSegmentKeys: ["retail"],
        distributionChannelKeys: ["europe"],
        locales: ["en-US"],
        objectID: "other-audience-product",
        price: 18_000,
        productCard: {
          availableForSale: true,
          id: "product-2",
          slug: "wheel-loader",
          startingPrice: {
            centAmount: 1_800_000,
            currencyCode: "USD",
          },
          title: "Wheel Loader",
        },
        storeKeys: ["other-store"],
        supplyChannelKeys: ["other-warehouse"],
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
                ? records.filter(
                    (record) =>
                      record.storeKeys.includes(audience.storeKey) &&
                      record.locales.includes(audience.locale) &&
                      record.currencies.includes(audience.currency) &&
                      audience.customerSegmentKeys.some((value) =>
                        record.customerSegmentKeys.includes(value)
                      ) &&
                      audience.distributionChannelKeys.some((value) =>
                        record.distributionChannelKeys.includes(value)
                      ) &&
                      audience.supplyChannelKeys.some((value) =>
                        record.supplyChannelKeys.includes(value)
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
      indices: {
        priceAscending: "catalog_price_asc",
        priceDescending: "catalog_price_desc",
        products: "catalog",
      },
    });
    const resolveAudience = vi
      .fn<SearchRouteDependencies["resolveAudience"]>()
      .mockResolvedValue(audience);
    const handler = makeSearchRouteHandler({
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
          indexName: "catalog",
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
