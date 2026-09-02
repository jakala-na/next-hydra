import "server-only";
import type {
  ProductSearchHit,
  QuerySuggestionSearchHit,
  ResourceSearchHit,
  SearchAudience,
  SearchBatch,
  SearchBatchResult,
  SearchIndexAlias,
  SearchProvider,
} from "@repo/search/contract";
import {
  PRODUCT_HIT_ATTRIBUTES,
  QUERY_SUGGESTION_HIT_ATTRIBUTES,
  RESOURCE_HIT_ATTRIBUTES,
  decodeProductSearchHit,
  decodeQuerySuggestionSearchHit,
  decodeResourceSearchHit,
} from "@repo/search/contract";
import { algoliasearch } from "algoliasearch";
import type { Algoliasearch } from "algoliasearch";
import { z } from "zod";

import { keys } from "./keys";

export type AlgoliaSearchIndexResolver = (locale: string) => string;

export interface AlgoliaSearchIndices {
  readonly products: AlgoliaSearchIndexResolver;
  readonly priceAscending: AlgoliaSearchIndexResolver;
  readonly priceDescending: AlgoliaSearchIndexResolver;
  readonly resources: AlgoliaSearchIndexResolver;
  readonly querySuggestions: AlgoliaSearchIndexResolver;
}

export interface AlgoliaSearchProviderOptions {
  readonly client: Pick<Algoliasearch, "search">;
  readonly indices: AlgoliaSearchIndices;
  readonly productHitMapping?: AlgoliaProductHitMapping;
  readonly querySuggestionHitMapping?: AlgoliaQuerySuggestionHitMapping;
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

export interface AlgoliaQuerySuggestionHitMapping {
  readonly attributesToRetrieve: readonly string[];
  readonly toQuerySuggestionSearchHit: (
    record: AlgoliaSearchRecord
  ) => QuerySuggestionSearchHit;
}

const defaultProductHitMapping: AlgoliaProductHitMapping = {
  attributesToRetrieve: PRODUCT_HIT_ATTRIBUTES,
  toProductSearchHit: decodeProductSearchHit,
};

const defaultResourceHitMapping: AlgoliaResourceHitMapping = {
  attributesToRetrieve: RESOURCE_HIT_ATTRIBUTES,
  toResourceSearchHit: decodeResourceSearchHit,
};

const defaultQuerySuggestionHitMapping: AlgoliaQuerySuggestionHitMapping = {
  attributesToRetrieve: QUERY_SUGGESTION_HIT_ATTRIBUTES,
  toQuerySuggestionSearchHit: decodeQuerySuggestionSearchHit,
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

type NormalizedSearchHit =
  | ProductSearchHit
  | QuerySuggestionSearchHit
  | ResourceSearchHit;

interface AlgoliaIndexStrategy {
  readonly attributesToRetrieve: readonly string[];
  readonly audienceFilter?: (audience: SearchAudience) => string;
  readonly normalizeHit: (hit: AlgoliaSearchRecord) => NormalizedSearchHit;
  readonly physicalIndex: AlgoliaSearchIndexResolver;
}

type AlgoliaIndexStrategies = Record<SearchIndexAlias, AlgoliaIndexStrategy>;

const createIndexStrategies = (
  indices: AlgoliaSearchIndices,
  productHitMapping: AlgoliaProductHitMapping,
  resourceHitMapping: AlgoliaResourceHitMapping,
  querySuggestionHitMapping: AlgoliaQuerySuggestionHitMapping
) => {
  const productStrategy = (
    physicalIndex: AlgoliaSearchIndexResolver
  ): AlgoliaIndexStrategy => ({
    attributesToRetrieve: productHitMapping.attributesToRetrieve,
    audienceFilter,
    normalizeHit: (hit) =>
      decodeProductSearchHit(productHitMapping.toProductSearchHit(hit)),
    physicalIndex,
  });
  const resourceStrategy = {
    attributesToRetrieve: resourceHitMapping.attributesToRetrieve,
    audienceFilter: resourceAudienceFilter,
    normalizeHit: (hit: AlgoliaSearchRecord) =>
      decodeResourceSearchHit(resourceHitMapping.toResourceSearchHit(hit)),
    physicalIndex: indices.resources,
  } satisfies AlgoliaIndexStrategy;
  const querySuggestionStrategy = {
    attributesToRetrieve: querySuggestionHitMapping.attributesToRetrieve,
    normalizeHit: (hit: AlgoliaSearchRecord) =>
      decodeQuerySuggestionSearchHit(
        querySuggestionHitMapping.toQuerySuggestionSearchHit(hit)
      ),
    physicalIndex: indices.querySuggestions,
  } satisfies AlgoliaIndexStrategy;

  return {
    products: productStrategy(indices.products),
    "products@price-asc": productStrategy(indices.priceAscending),
    "products@price-desc": productStrategy(indices.priceDescending),
    "query-suggestions": querySuggestionStrategy,
    resources: resourceStrategy,
  } satisfies AlgoliaIndexStrategies;
};

const mapBatch = (
  batch: SearchBatch,
  audience: SearchAudience,
  strategies: AlgoliaIndexStrategies
) =>
  batch.map(({ indexName, params }) => {
    const strategy = strategies[indexName];
    const filters = strategy.audienceFilter?.(audience);
    const request = {
      ...params,
      attributesToRetrieve: [...strategy.attributesToRetrieve],
      indexName: strategy.physicalIndex(audience.locale),
    };
    return filters === undefined ? request : { ...request, filters };
  });

const normalizeHits = (
  strategy: AlgoliaIndexStrategy,
  hits: readonly AlgoliaSearchRecord[]
): NormalizedSearchHit[] => hits.map(strategy.normalizeHit);

export const createAlgoliaSearchProvider = ({
  client,
  indices,
  productHitMapping = defaultProductHitMapping,
  querySuggestionHitMapping = defaultQuerySuggestionHitMapping,
  resourceHitMapping = defaultResourceHitMapping,
}: AlgoliaSearchProviderOptions): SearchProvider => {
  const strategies = createIndexStrategies(
    indices,
    productHitMapping,
    resourceHitMapping,
    querySuggestionHitMapping
  );

  return {
    search: async (batch, audience) => {
      const response = await client.search({
        requests: mapBatch(batch, audience, strategies),
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
          throw new Error(
            "Algolia returned a result without a matching request"
          );
        }

        return {
          ...result,
          hits: normalizeHits(strategies[request.indexName], result.hits),
          index: request.indexName,
        };
      });

      return { results } satisfies SearchBatchResult;
    },
  };
};

let configuredProvider: SearchProvider | undefined;

const localizedIndexName =
  (baseName: string): AlgoliaSearchIndexResolver =>
  (locale) =>
    `${baseName}_${locale}`;

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
      priceAscending: localizedIndexName(
        config.ALGOLIA_PRODUCTS_PRICE_ASC_INDEX_NAME
      ),
      priceDescending: localizedIndexName(
        config.ALGOLIA_PRODUCTS_PRICE_DESC_INDEX_NAME
      ),
      products: localizedIndexName(config.ALGOLIA_PRODUCTS_INDEX_NAME),
      querySuggestions: localizedIndexName(
        config.ALGOLIA_QUERY_SUGGESTIONS_INDEX_NAME
      ),
      resources: localizedIndexName(config.ALGOLIA_RESOURCES_INDEX_NAME),
    },
  });
  return configuredProvider;
};

export const searchProvider: SearchProvider = {
  search: async (batch, audience, signal) =>
    await providerFromEnvironment().search(batch, audience, signal),
};
