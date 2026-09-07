import {
  createCanonicalContentSearchProjection,
  defineContentSearchProjection,
} from "@repo/search/content-search-projection";
import {
  decodeProductSearchHit,
  PRODUCT_HIT_ATTRIBUTES,
  CONTENT_HIT_ATTRIBUTES,
} from "@repo/search/contract";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { defineAlgoliaProductFacetFields } from "./product-facet-fields";
import { createAlgoliaSearchProvider } from "./provider";
import type { AlgoliaSearchProviderOptions } from "./provider";

const audience = {
  locale: "en-US",
  product: {
    currency: "USD",
    priceAudienceIds: ["contractors-id"],
    storeKey: "default-store",
  },
} as const;

const localizedIndex =
  (baseName: string) => (searchAudience: { readonly locale: string }) =>
    `${baseName}_${searchAudience.locale}`;
const canonicalContentProjection =
  createCanonicalContentSearchProjection("content");

describe(createAlgoliaSearchProvider, () => {
  it("maps logical sorts and applies an unoverrideable audience filter", async () => {
    const search = vi
      .fn<AlgoliaSearchProviderOptions["client"]["search"]>()
      .mockResolvedValue({
        results: [
          {
            hits: [],
            hitsPerPage: 12,
            index: "catalog_price_asc_en-US",
            nbHits: 0,
            nbPages: 0,
            page: 0,
            processingTimeMS: 1,
            query: "",
          },
          {
            hits: [],
            hitsPerPage: 12,
            index: "catalog_price_desc_en-US",
            nbHits: 0,
            nbPages: 0,
            page: 0,
            processingTimeMS: 1,
            query: "",
          },
        ],
      });
    const provider = createAlgoliaSearchProvider({
      analyticsTags: (searchAudience) => [
        `environment:acceptance|locale:${searchAudience.locale.toLowerCase()}`,
      ],
      client: { search },
      contentProjection: canonicalContentProjection,
      indices: {
        priceAscending: localizedIndex("catalog_price_asc"),
        priceDescending: localizedIndex("catalog_price_desc"),
        products: localizedIndex("catalog"),
        querySuggestions: localizedIndex("query_suggestions"),
      },
      priceCustomerGroupIds: ["contractors-id"],
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
        {
          indexName: "products@price-desc",
          params: { hitsPerPage: 12 },
        },
      ],
      audience
    );

    expect(search).toHaveBeenCalledWith({
      requests: [
        {
          analytics: true,
          analyticsTags: ["environment:acceptance|locale:en-us"],
          attributesToRetrieve: [...PRODUCT_HIT_ATTRIBUTES],
          facetFilters: ["category.en-US:excavators"],
          filters: 'priceAudienceIds:"contractors-id"',
          hitsPerPage: 12,
          indexName: "catalog_price_asc_en-US",
          restrictSearchableAttributes: [
            "productCard.title.en-US",
            "productCard.description.en-US",
            "categories.label.en-US",
          ],
        },
        {
          analytics: true,
          analyticsTags: ["environment:acceptance|locale:en-us"],
          attributesToRetrieve: [...PRODUCT_HIT_ATTRIBUTES],
          filters: 'priceAudienceIds:"contractors-id"',
          hitsPerPage: 12,
          indexName: "catalog_price_desc_en-US",
          restrictSearchableAttributes: [
            "productCard.title.en-US",
            "productCard.description.en-US",
            "categories.label.en-US",
          ],
        },
      ],
    });
    expect(response.results[0]).toMatchObject({ index: "products@price-asc" });
    expect(response.results[1]).toMatchObject({ index: "products@price-desc" });
  });

  it("translates canonical Product facets at the provider seam", async () => {
    interface PhysicalProductIndex {
      readonly inventory: { readonly status: string };
      readonly pricing: { readonly current: number };
      readonly taxonomy: { readonly category: readonly string[] };
    }

    const productFacetFields =
      defineAlgoliaProductFacetFields<PhysicalProductIndex>()({
        availability: "inventory.status",
        category: "taxonomy.category",
        price: "pricing.current",
      });
    const search = vi
      .fn<AlgoliaSearchProviderOptions["client"]["search"]>()
      .mockResolvedValue({
        results: [
          {
            facets: {
              "inventory.status": { "in-stock": 2 },
              "taxonomy.category": { excavators: 2 },
            },
            facets_stats: {
              "pricing.current": {
                avg: 15_000,
                max: 18_000,
                min: 12_000,
                sum: 30_000,
              },
            },
            hits: [],
            hitsPerPage: 12,
            index: "catalog_en-US",
            nbHits: 2,
            nbPages: 1,
            page: 0,
            processingTimeMS: 1,
            query: "",
          },
        ],
      });
    const provider = createAlgoliaSearchProvider({
      client: { search },
      contentProjection: canonicalContentProjection,
      indices: {
        priceAscending: localizedIndex("catalog_price_asc"),
        priceDescending: localizedIndex("catalog_price_desc"),
        products: localizedIndex("catalog"),
        querySuggestions: localizedIndex("query_suggestions"),
      },
      priceCustomerGroupIds: ["contractors-id"],
      productFacetFields: () => productFacetFields,
    });

    const response = await provider.search(
      [
        {
          indexName: "products",
          params: {
            facetFilters: [
              "availability:in-stock",
              ["category:excavators", "category:loaders"],
            ],
            facets: ["availability", "category", "price"],
            numericFilters: ["price>=12000", "price<=18000"],
          },
        },
      ],
      audience
    );

    expect(search).toHaveBeenCalledWith({
      requests: [
        expect.objectContaining({
          facetFilters: [
            "inventory.status:in-stock",
            ["taxonomy.category:excavators", "taxonomy.category:loaders"],
          ],
          facets: ["inventory.status", "taxonomy.category", "pricing.current"],
          numericFilters: ["pricing.current>=12000", "pricing.current<=18000"],
        }),
      ],
    });
    expect(response.results[0]).toMatchObject({
      facets: {
        availability: { "in-stock": 2 },
        category: { excavators: 2 },
      },
      facets_stats: {
        price: { max: 18_000, min: 12_000 },
      },
      index: "products",
    });
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
      contentProjection: canonicalContentProjection,
      indices: {
        priceAscending: localizedIndex("catalog_price_asc"),
        priceDescending: localizedIndex("catalog_price_desc"),
        products: localizedIndex("catalog"),
        querySuggestions: localizedIndex("query_suggestions"),
      },
      priceCustomerGroupIds: ["contractors-id"],
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
          indexName: "catalog_en-US",
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

  it("normalizes provider-specific Content records without requiring a Product audience", async () => {
    const search = vi
      .fn<AlgoliaSearchProviderOptions["client"]["search"]>()
      .mockResolvedValue({
        results: [
          {
            hits: [
              {
                _content_type: "articles",
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
            index: "cms_content",
            nbHits: 1,
            nbPages: 1,
            page: 0,
            processingTimeMS: 1,
            query: "excavator",
          },
        ],
      });
    const provider = createAlgoliaSearchProvider({
      analyticsTags: (searchAudience) => [
        `environment:acceptance|locale:${searchAudience.locale.toLowerCase()}`,
      ],
      client: { search },
      contentProjection: defineContentSearchProjection({
        attributesToRetrieve: ["objectID", "_content_type", "content"],
        filterAttributes: ["environment", "publish_details.locale"],
        filters: (searchAudience) => [
          { attribute: "environment", values: ["dev"] },
          {
            attribute: "publish_details.locale",
            values: [searchAudience.locale.toLowerCase()],
          },
        ],
        indexName: () => "cms_content",
        restrictSearchableAttributes: (searchAudience) => [
          `articles.dev.${searchAudience.locale}`,
          `landing_pages.dev.${searchAudience.locale}`,
        ],
        searchableAttributes: () => [],
        toContentSearchHit: (record) => {
          const hit = z
            .object({
              _content_type: z.string(),
              content: z.object({
                description: z.string(),
                id: z.string(),
                path: z.string(),
                published: z.string(),
                title: z.string(),
              }),
              objectID: z.string(),
            })
            .parse(record);
          return {
            contentCard: {
              contentType: hit._content_type,
              id: hit.content.id,
              path: hit.content.path,
              publishedAt: hit.content.published,
              summary: hit.content.description,
              title: hit.content.title,
            },
            objectID: hit.objectID,
          };
        },
      }),
      indices: {
        priceAscending: localizedIndex("catalog_price_asc"),
        priceDescending: localizedIndex("catalog_price_desc"),
        products: localizedIndex("catalog"),
        querySuggestions: localizedIndex("query_suggestions"),
      },
      priceCustomerGroupIds: ["contractors-id"],
    });

    const response = await provider.search(
      [
        {
          indexName: "content",
          params: {
            attributesToRetrieve: [...CONTENT_HIT_ATTRIBUTES],
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
          analytics: true,
          analyticsTags: ["environment:acceptance|locale:en-us"],
          attributesToRetrieve: ["objectID", "_content_type", "content"],
          filters: 'environment:"dev" AND publish_details.locale:"en-us"',
          indexName: "cms_content",
          restrictSearchableAttributes: [
            "articles.dev.en-US",
            "landing_pages.dev.en-US",
          ],
        }),
      ],
    });
    expect(response.results[0]).toMatchObject({
      hits: [
        {
          contentCard: {
            contentType: "articles",
            id: "guide-1",
            path: "/resources/excavator-guide",
            title: "Compact excavator guide",
          },
          objectID: "resource-record-1",
        },
      ],
      index: "content",
    });
  });

  it("maps and normalizes the provider Query Suggestions index", async () => {
    const search = vi
      .fn<AlgoliaSearchProviderOptions["client"]["search"]>()
      .mockResolvedValue({
        results: [
          {
            hits: [
              {
                objectID: "suggestion-1",
                suggestion: {
                  popularity: 12,
                  text: "excavator attachments",
                  wordCount: 2,
                },
              },
            ],
            hitsPerPage: 4,
            index: "catalog_query_suggestions_fr-FR",
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
      contentProjection: canonicalContentProjection,
      indices: {
        priceAscending: localizedIndex("catalog_price_asc"),
        priceDescending: localizedIndex("catalog_price_desc"),
        products: localizedIndex("catalog"),
        querySuggestions: localizedIndex("catalog_query_suggestions"),
      },
      priceCustomerGroupIds: ["contractors-id"],
      querySuggestionHitMapping: {
        attributesToRetrieve: ["objectID", "suggestion.text"],
        toQuerySuggestionSearchHit: (record) => {
          const suggestion = z
            .object({
              suggestion: z.object({
                popularity: z.number(),
                text: z.string(),
                wordCount: z.number(),
              }),
            })
            .parse(record);
          return {
            nb_words: suggestion.suggestion.wordCount,
            objectID: record.objectID,
            popularity: suggestion.suggestion.popularity,
            query: suggestion.suggestion.text,
          };
        },
      },
    });

    const response = await provider.search(
      [
        {
          indexName: "query-suggestions",
          params: { hitsPerPage: 4, query: "excavator" },
        },
      ],
      { locale: "fr-FR" }
    );

    expect(search).toHaveBeenCalledWith({
      requests: [
        {
          attributesToRetrieve: ["objectID", "suggestion.text"],
          hitsPerPage: 4,
          indexName: "catalog_query_suggestions_fr-FR",
          query: "excavator",
        },
      ],
    });
    expect(response.results[0]).toMatchObject({
      hits: [
        {
          nb_words: 2,
          objectID: "suggestion-1",
          popularity: 12,
          query: "excavator attachments",
        },
      ],
      index: "query-suggestions",
    });
  });

  it("falls back to public when the resolved price audience is not provisioned", async () => {
    const search = vi
      .fn<AlgoliaSearchProviderOptions["client"]["search"]>()
      .mockResolvedValue({
        results: [
          {
            hits: [],
            hitsPerPage: 12,
            index: "catalog_en-US",
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
      contentProjection: canonicalContentProjection,
      indices: {
        priceAscending: localizedIndex("catalog_price_asc"),
        priceDescending: localizedIndex("catalog_price_desc"),
        products: localizedIndex("catalog"),
        querySuggestions: localizedIndex("query_suggestions"),
      },
      priceCustomerGroupIds: ["contractors-id"],
    });

    await provider.search(
      [{ indexName: "products", params: { hitsPerPage: 12 } }],
      {
        ...audience,
        product: {
          ...audience.product,
          priceAudienceIds: ["unconfigured-id"],
        },
      }
    );

    expect(search).toHaveBeenCalledWith({
      requests: [
        expect.objectContaining({
          filters: 'priceAudienceIds:"public"',
        }),
      ],
    });
  });
});
