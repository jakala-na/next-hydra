import {
  decodeProductSearchHit,
  PRODUCT_HIT_ATTRIBUTES,
  RESOURCE_HIT_ATTRIBUTES,
} from "@repo/search/contract";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { audienceFilter, createAlgoliaSearchProvider } from "./provider";
import type { AlgoliaSearchProviderOptions } from "./provider";

const audience = {
  locale: "en-US",
  product: {
    currency: "USD",
    customerSegmentKeys: ["public", "contractors"],
    distributionChannelKeys: ["north-america"],
    storeKey: "default-store",
    supplyChannelKeys: ["main-warehouse"],
  },
} as const;

describe(createAlgoliaSearchProvider, () => {
  it("maps logical sorts and applies an unoverrideable audience filter", async () => {
    const search = vi
      .fn<AlgoliaSearchProviderOptions["client"]["search"]>()
      .mockResolvedValue({
        results: [
          {
            hits: [],
            hitsPerPage: 12,
            index: "catalog_price_asc",
            nbHits: 0,
            nbPages: 0,
            page: 0,
            processingTimeMS: 1,
            query: "",
          },
        ],
      });
    const provider = createAlgoliaSearchProvider({
      client: { search },
      indices: {
        priceAscending: "catalog_price_asc",
        priceDescending: "catalog_price_desc",
        products: "catalog",
        resources: "resources",
      },
    });

    const response = await provider.search(
      [
        {
          indexName: "products@price-asc",
          params: {
            facetFilters: ["category:excavators"],
            hitsPerPage: 12,
          },
        },
      ],
      audience
    );

    expect(search).toHaveBeenCalledWith({
      requests: [
        {
          attributesToRetrieve: [...PRODUCT_HIT_ATTRIBUTES],
          facetFilters: ["category:excavators"],
          filters:
            'storeKeys:"default-store" AND locales:"en-US" AND currencies:"USD" AND (customerSegmentKeys:"public" OR customerSegmentKeys:"contractors") AND distributionChannelKeys:"north-america" AND supplyChannelKeys:"main-warehouse"',
          hitsPerPage: 12,
          indexName: "catalog_price_asc",
        },
      ],
    });
    expect(response.results[0]).toMatchObject({ index: "products@price-asc" });
  });

  it("normalizes provider-specific nested records into canonical Product hits", async () => {
    const nestedHitSchema = z.object({
      objectID: z.string(),
      product: z.object({
        availability: z.literal("in-stock"),
        categories: z.array(z.object({ key: z.string(), label: z.string() })),
        currency: z.string(),
        id: z.string(),
        image: z.object({ alt: z.string(), url: z.string() }),
        name: z.string(),
        price: z.number(),
        slug: z.string(),
      }),
    });
    const search = vi
      .fn<AlgoliaSearchProviderOptions["client"]["search"]>()
      .mockResolvedValue({
        results: [
          {
            hits: [
              {
                objectID: "record-1",
                product: {
                  availability: "in-stock",
                  categories: [{ key: "excavators", label: "Excavators" }],
                  currency: "USD",
                  id: "product-1",
                  image: {
                    alt: "Excavator",
                    url: "https://example.test/excavator.jpg",
                  },
                  name: "A790 Compact Excavator",
                  price: 12_500,
                  slug: "a790-compact-excavator",
                },
              },
            ],
            hitsPerPage: 12,
            index: "catalog",
            nbHits: 1,
            nbPages: 1,
            page: 0,
            processingTimeMS: 1,
            query: "excavator",
          },
        ],
      });
    const provider = createAlgoliaSearchProvider({
      client: { search },
      indices: {
        priceAscending: "catalog_price_asc",
        priceDescending: "catalog_price_desc",
        products: "catalog",
        resources: "resources",
      },
      productHitMapping: {
        attributesToRetrieve: ["objectID", "product"],
        toProductSearchHit: (value) => {
          const hit = nestedHitSchema.parse(value);
          return decodeProductSearchHit({
            categories: hit.product.categories,
            objectID: hit.objectID,
            productCard: {
              availableForSale: hit.product.availability === "in-stock",
              featuredImage: {
                altText: hit.product.image.alt,
                url: hit.product.image.url,
              },
              id: hit.product.id,
              slug: hit.product.slug,
              startingPrice: {
                centAmount: hit.product.price * 100,
                currencyCode: hit.product.currency,
              },
              title: hit.product.name,
            },
          });
        },
      },
    });

    const response = await provider.search(
      [
        {
          indexName: "products",
          params: {
            attributesToRetrieve: ["objectID", "title"],
            hitsPerPage: 12,
            query: "excavator",
          },
        },
      ],
      audience
    );

    expect(search).toHaveBeenCalledWith({
      requests: [
        expect.objectContaining({
          attributesToRetrieve: ["objectID", "product"],
          indexName: "catalog",
        }),
      ],
    });
    expect(response.results[0]).toMatchObject({
      hits: [
        {
          categories: [{ key: "excavators", label: "Excavators" }],
          objectID: "record-1",
          productCard: {
            availableForSale: true,
            featuredImage: {
              altText: "Excavator",
              url: "https://example.test/excavator.jpg",
            },
            id: "product-1",
            slug: "a790-compact-excavator",
            startingPrice: {
              centAmount: 1_250_000,
              currencyCode: "USD",
            },
            title: "A790 Compact Excavator",
          },
        },
      ],
      index: "products",
    });
  });

  it("normalizes provider-specific Resource records without requiring a Product audience", async () => {
    const nestedHitSchema = z.object({
      content: z.object({
        description: z.string(),
        id: z.string(),
        path: z.string(),
        published: z.string(),
        title: z.string(),
      }),
      objectID: z.string(),
    });
    const search = vi
      .fn<AlgoliaSearchProviderOptions["client"]["search"]>()
      .mockResolvedValue({
        results: [
          {
            hits: [
              {
                content: {
                  description: "Choose the right compact excavator.",
                  id: "guide-1",
                  path: "/resources/excavator-guide",
                  published: "2026-08-22",
                  title: "Compact excavator guide",
                },
                objectID: "resource-record-1",
              },
            ],
            hitsPerPage: 6,
            index: "cms_resources",
            nbHits: 1,
            nbPages: 1,
            page: 0,
            processingTimeMS: 1,
            query: "excavator",
          },
        ],
      });
    const provider = createAlgoliaSearchProvider({
      client: { search },
      indices: {
        priceAscending: "catalog_price_asc",
        priceDescending: "catalog_price_desc",
        products: "catalog",
        resources: "cms_resources",
      },
      resourceHitMapping: {
        attributesToRetrieve: ["objectID", "content"],
        toResourceSearchHit: (value) => {
          const hit = nestedHitSchema.parse(value);
          return {
            objectID: hit.objectID,
            resourceCard: {
              id: hit.content.id,
              path: hit.content.path,
              publishedAt: hit.content.published,
              summary: hit.content.description,
              title: hit.content.title,
            },
          };
        },
      },
    });

    const response = await provider.search(
      [
        {
          indexName: "resources",
          params: {
            attributesToRetrieve: [...RESOURCE_HIT_ATTRIBUTES],
            hitsPerPage: 6,
            query: "excavator",
          },
        },
      ],
      { locale: "en-US" }
    );

    expect(search).toHaveBeenCalledWith({
      requests: [
        expect.objectContaining({
          attributesToRetrieve: ["objectID", "content"],
          filters: 'locales:"en-US"',
          indexName: "cms_resources",
        }),
      ],
    });
    expect(response.results[0]).toMatchObject({
      hits: [
        {
          objectID: "resource-record-1",
          resourceCard: {
            id: "guide-1",
            path: "/resources/excavator-guide",
            title: "Compact excavator guide",
          },
        },
      ],
      index: "resources",
    });
  });

  it("falls back to the public audience for unresolved optional dimensions", () => {
    expect(
      audienceFilter({
        ...audience,
        product: {
          ...audience.product,
          customerSegmentKeys: [],
          distributionChannelKeys: [],
          supplyChannelKeys: [],
        },
      })
    ).toContain(
      'customerSegmentKeys:"public" AND distributionChannelKeys:"public" AND supplyChannelKeys:"public"'
    );
  });
});
