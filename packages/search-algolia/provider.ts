import "server-only";
import type {
  ProductSearchHit,
  ResourceSearchHit,
  SearchAudience,
  SearchBatch,
  SearchBatchResult,
  SearchIndexAlias,
  SearchProvider,
} from "@repo/search/contract";
import {
  PRODUCT_HIT_ATTRIBUTES,
  RESOURCE_HIT_ATTRIBUTES,
  decodeProductSearchHit,
  decodeResourceSearchHit,
  isProductIndexAlias,
} from "@repo/search/contract";
import { algoliasearch } from "algoliasearch";
import type { Algoliasearch } from "algoliasearch";
import { z } from "zod";

import { keys } from "./keys";

export interface AlgoliaSearchIndices {
  readonly products: string;
  readonly priceAscending: string;
  readonly priceDescending: string;
  readonly resources: string;
}

export interface AlgoliaSearchProviderOptions {
  readonly client: Pick<Algoliasearch, "search">;
  readonly indices: AlgoliaSearchIndices;
  readonly productHitMapping?: AlgoliaProductHitMapping;
  readonly resourceHitMapping?: AlgoliaResourceHitMapping;
}

const algoliaSearchRecordSchema = z.record(z.string(), z.unknown());
export type AlgoliaSearchRecord = z.infer<typeof algoliaSearchRecordSchema>;

export interface AlgoliaProductHitMapping {
  readonly attributesToRetrieve: readonly string[];
  readonly toProductSearchHit: (
    record: AlgoliaSearchRecord
  ) => ProductSearchHit;
}

export interface AlgoliaResourceHitMapping {
  readonly attributesToRetrieve: readonly string[];
  readonly toResourceSearchHit: (
    record: AlgoliaSearchRecord
  ) => ResourceSearchHit;
}

const defaultProductHitMapping: AlgoliaProductHitMapping = {
  attributesToRetrieve: PRODUCT_HIT_ATTRIBUTES,
  toProductSearchHit: decodeProductSearchHit,
};

const defaultResourceHitMapping: AlgoliaResourceHitMapping = {
  attributesToRetrieve: RESOURCE_HIT_ATTRIBUTES,
  toResourceSearchHit: decodeResourceSearchHit,
};

const responseEnvelopeSchema = z.object({
  results: z.array(
    z
      .object({
        hits: z.array(algoliaSearchRecordSchema),
      })
      .passthrough()
  ),
});

const escapeFilterValue = (value: string): string =>
  value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');

const filterValue = (attribute: string, value: string): string =>
  `${attribute}:"${escapeFilterValue(value)}"`;

const filterValues = (attribute: string, values: readonly string[]): string => {
  const effectiveValues = values.length === 0 ? ["public"] : values;

  return effectiveValues.length === 1
    ? filterValue(attribute, effectiveValues[0] ?? "public")
    : `(${effectiveValues.map((value) => filterValue(attribute, value)).join(" OR ")})`;
};

export const audienceFilter = (audience: SearchAudience): string => {
  if (audience.product === undefined) {
    throw new Error("Product search requires a Product audience");
  }

  return [
    filterValue("storeKeys", audience.product.storeKey),
    filterValue("locales", audience.locale),
    filterValue("currencies", audience.product.currency),
    filterValues("customerSegmentKeys", audience.product.customerSegmentKeys),
    filterValues(
      "distributionChannelKeys",
      audience.product.distributionChannelKeys
    ),
    filterValues("supplyChannelKeys", audience.product.supplyChannelKeys),
  ].join(" AND ");
};

export const resourceAudienceFilter = (audience: SearchAudience): string =>
  filterValue("locales", audience.locale);

const physicalIndex = (
  alias: SearchIndexAlias,
  indices: AlgoliaSearchIndices
): string => {
  const physicalIndices = {
    products: indices.products,
    "products@price-asc": indices.priceAscending,
    "products@price-desc": indices.priceDescending,
    resources: indices.resources,
  } satisfies Record<SearchIndexAlias, string>;

  return physicalIndices[alias];
};

const mapBatch = (
  batch: SearchBatch,
  audience: SearchAudience,
  indices: AlgoliaSearchIndices,
  productHitMapping: AlgoliaProductHitMapping,
  resourceHitMapping: AlgoliaResourceHitMapping
) =>
  batch.map(({ indexName, params }) => {
    const productIndex = isProductIndexAlias(indexName);
    return {
      ...params,
      attributesToRetrieve: [
        ...(productIndex
          ? productHitMapping.attributesToRetrieve
          : resourceHitMapping.attributesToRetrieve),
      ],
      filters: productIndex
        ? audienceFilter(audience)
        : resourceAudienceFilter(audience),
      indexName: physicalIndex(indexName, indices),
    };
  });

export const createAlgoliaSearchProvider = ({
  client,
  indices,
  productHitMapping = defaultProductHitMapping,
  resourceHitMapping = defaultResourceHitMapping,
}: AlgoliaSearchProviderOptions): SearchProvider => ({
  search: async (batch, audience) => {
    const response = await client.search({
      requests: mapBatch(
        batch,
        audience,
        indices,
        productHitMapping,
        resourceHitMapping
      ),
    });
    const envelope = responseEnvelopeSchema.parse(response);
    if (envelope.results.length !== batch.length) {
      throw new Error(
        "Algolia returned an unexpected number of search results"
      );
    }

    const results = envelope.results.map((result, index) => {
      const request = batch[index];
      if (request === undefined) {
        throw new Error("Algolia returned a result without a matching request");
      }

      return {
        ...result,
        hits: isProductIndexAlias(request.indexName)
          ? result.hits.map((hit) =>
              decodeProductSearchHit(productHitMapping.toProductSearchHit(hit))
            )
          : result.hits.map((hit) =>
              decodeResourceSearchHit(
                resourceHitMapping.toResourceSearchHit(hit)
              )
            ),
        index: request.indexName,
      };
    });

    return { results } satisfies SearchBatchResult;
  },
});

let configuredProvider: SearchProvider | undefined;

const providerFromEnvironment = (): SearchProvider => {
  if (configuredProvider !== undefined) {
    return configuredProvider;
  }

  const config = keys();
  configuredProvider = createAlgoliaSearchProvider({
    client: algoliasearch(
      config.ALGOLIA_APPLICATION_ID,
      config.ALGOLIA_SEARCH_API_KEY
    ),
    indices: {
      priceAscending: config.ALGOLIA_PRODUCTS_PRICE_ASC_INDEX_NAME,
      priceDescending: config.ALGOLIA_PRODUCTS_PRICE_DESC_INDEX_NAME,
      products: config.ALGOLIA_PRODUCTS_INDEX_NAME,
      resources: config.ALGOLIA_RESOURCES_INDEX_NAME,
    },
  });
  return configuredProvider;
};

export const searchProvider: SearchProvider = {
  search: async (batch, audience, signal) =>
    await providerFromEnvironment().search(batch, audience, signal),
};
