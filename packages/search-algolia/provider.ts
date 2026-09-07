import "server-only";
import type {
  ContentSearchProjection,
  ContentSearchProjectionFactory,
} from "@repo/search/content-search-projection";
import type {
  ContentSearchHit,
  ProductFacet,
  ProductSearchHit,
  QuerySuggestionSearchHit,
  SearchAudience,
  SearchBatch,
  SearchBatchResult,
  SearchIndexAlias,
  SearchProvider,
} from "@repo/search/contract";
import {
  QUERY_SUGGESTION_HIT_ATTRIBUTES,
  decodeQuerySuggestionSearchHit,
  decodeContentSearchHit,
} from "@repo/search/contract";
import { PRODUCT_FACETS, isProductFacet } from "@repo/search/product-discovery";
import { algoliasearch } from "algoliasearch";
import type {
  Algoliasearch,
  FacetFilters,
  NumericFilters,
} from "algoliasearch";
import { Schema } from "effect";

import { createAlgoliaAnalyticsTags } from "./analytics-tags";
import {
  algoliaConnectorCurrency,
  algoliaConnectorLocale,
} from "./connector/commercetools/generated-product";
import { contentIndexName, createAlgoliaSearchIndices } from "./index-graph";
import { keys } from "./keys";
import {
  parsePriceCustomerGroupIds,
  resolvePriceAudienceIds,
} from "./price-audience";
import {
  algoliaProductFacetFields,
  algoliaProductFieldPath,
} from "./product-facet-fields";
import type { AlgoliaProductFacetFields } from "./product-facet-fields";
import { defaultAlgoliaProductHitMapping } from "./product-hit";
import { AlgoliaSearchRecord } from "./search-record";

export type { AlgoliaSearchRecord } from "./search-record";

export type AlgoliaSearchIndexResolver = (audience: SearchAudience) => string;

export interface AlgoliaSearchIndices {
  readonly products: AlgoliaSearchIndexResolver;
  readonly priceAscending: AlgoliaSearchIndexResolver;
  readonly priceDescending: AlgoliaSearchIndexResolver;
  readonly querySuggestions: AlgoliaSearchIndexResolver;
}

export interface AlgoliaSearchProviderOptions {
  readonly client: Pick<Algoliasearch, "search">;
  readonly contentProjection: ContentSearchProjection;
  readonly indices: AlgoliaSearchIndices;
  readonly priceCustomerGroupIds: readonly string[];
  readonly analyticsTags?: AlgoliaAnalyticsTagsResolver;
  readonly productFacetFields?: AlgoliaProductFacetFieldsResolver;
  readonly productHitMapping?: AlgoliaProductHitMapping;
  readonly querySuggestionHitMapping?: AlgoliaQuerySuggestionHitMapping;
}

export interface AlgoliaProductHitMapping {
  readonly attributesToRetrieve: readonly string[];
  readonly restrictSearchableAttributes?: (
    audience: SearchAudience
  ) => readonly string[];
  readonly toProductSearchHit: (
    record: AlgoliaSearchRecord,
    audience: SearchAudience
  ) => ProductSearchHit;
}

export type AlgoliaProductFacetFieldsResolver = (
  audience: SearchAudience
) => AlgoliaProductFacetFields<string>;

export type AlgoliaAnalyticsTagsResolver = (
  audience: SearchAudience
) => readonly string[];

export interface AlgoliaQuerySuggestionHitMapping {
  readonly attributesToRetrieve: readonly string[];
  readonly toQuerySuggestionSearchHit: (
    record: AlgoliaSearchRecord
  ) => QuerySuggestionSearchHit;
}

const defaultQuerySuggestionHitMapping: AlgoliaQuerySuggestionHitMapping = {
  attributesToRetrieve: QUERY_SUGGESTION_HIT_ATTRIBUTES,
  toQuerySuggestionSearchHit: decodeQuerySuggestionSearchHit,
};

const FacetValues = Schema.Record(
  Schema.String,
  Schema.Record(Schema.String, Schema.Finite)
);
const AlgoliaSearchResult = Schema.StructWithRest(
  Schema.Struct({
    facets: Schema.optional(FacetValues),
    facets_stats: Schema.optional(FacetValues),
    hits: Schema.Array(AlgoliaSearchRecord),
  }),
  [Schema.Record(Schema.String, Schema.Unknown)]
);
const AlgoliaSearchResponse = Schema.Struct({
  results: Schema.Array(AlgoliaSearchResult),
});
const decodeAlgoliaSearchResponse = Schema.decodeUnknownSync(
  AlgoliaSearchResponse
);

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

const productAudience = (audience: SearchAudience) => {
  if (audience.product === undefined) {
    throw new Error("Product search requires a Product audience");
  }
  return audience.product;
};

const audienceFilter = (
  audience: SearchAudience,
  priceCustomerGroupIds: readonly string[]
): string => {
  const product = productAudience(audience);

  return filterValues(
    algoliaProductFieldPath("priceAudienceIds"),
    resolvePriceAudienceIds(product.priceAudienceIds, priceCustomerGroupIds)
  );
};

export const contentAudienceFilter = (
  audience: SearchAudience,
  projection: ContentSearchProjection
): string | undefined => {
  const filters = projection.filters(audience);
  if (filters.length === 0) {
    return undefined;
  }
  return filters
    .map(({ attribute, values }) =>
      values.length === 1
        ? filterValue(attribute, values[0])
        : `(${values.map((value) => filterValue(attribute, value)).join(" OR ")})`
    )
    .join(" AND ");
};

type NormalizedSearchHit =
  | ContentSearchHit
  | ProductSearchHit
  | QuerySuggestionSearchHit;

interface AlgoliaIndexStrategy {
  readonly analyticsTags?: AlgoliaAnalyticsTagsResolver;
  readonly attributesToRetrieve: readonly string[];
  readonly audienceFilter?: (audience: SearchAudience) => string | undefined;
  readonly normalizeHit: (
    hit: AlgoliaSearchRecord,
    audience: SearchAudience
  ) => NormalizedSearchHit;
  readonly physicalIndex: AlgoliaSearchIndexResolver;
  readonly productFacetFields?: AlgoliaProductFacetFieldsResolver;
  readonly restrictSearchableAttributes?: (
    audience: SearchAudience
  ) => readonly string[];
}

type AlgoliaIndexStrategies = Record<SearchIndexAlias, AlgoliaIndexStrategy>;

const createIndexStrategies = (
  indices: AlgoliaSearchIndices,
  analyticsTags: AlgoliaAnalyticsTagsResolver | undefined,
  productFacetFields: AlgoliaProductFacetFieldsResolver,
  productHitMapping: AlgoliaProductHitMapping,
  contentProjection: ContentSearchProjection,
  querySuggestionHitMapping: AlgoliaQuerySuggestionHitMapping,
  priceCustomerGroupIds: readonly string[]
) => {
  const productStrategy = (
    physicalIndex: AlgoliaSearchIndexResolver
  ): AlgoliaIndexStrategy => ({
    analyticsTags,
    attributesToRetrieve: productHitMapping.attributesToRetrieve,
    audienceFilter: (audience) =>
      audienceFilter(audience, priceCustomerGroupIds),
    normalizeHit: (hit, audience) =>
      productHitMapping.toProductSearchHit(hit, audience),
    physicalIndex,
    productFacetFields,
    restrictSearchableAttributes:
      productHitMapping.restrictSearchableAttributes,
  });
  const contentStrategy = {
    analyticsTags,
    attributesToRetrieve: contentProjection.attributesToRetrieve,
    audienceFilter: (audience: SearchAudience) =>
      contentAudienceFilter(audience, contentProjection),
    normalizeHit: (hit: AlgoliaSearchRecord, audience: SearchAudience) =>
      decodeContentSearchHit(
        contentProjection.toContentSearchHit(hit, audience)
      ),
    physicalIndex: contentProjection.indexName,
    productFacetFields: undefined,
    restrictSearchableAttributes:
      contentProjection.restrictSearchableAttributes,
  } satisfies AlgoliaIndexStrategy;
  const querySuggestionStrategy = {
    analyticsTags: undefined,
    attributesToRetrieve: querySuggestionHitMapping.attributesToRetrieve,
    normalizeHit: (hit: AlgoliaSearchRecord) =>
      decodeQuerySuggestionSearchHit(
        querySuggestionHitMapping.toQuerySuggestionSearchHit(hit)
      ),
    physicalIndex: indices.querySuggestions,
    productFacetFields: undefined,
  } satisfies AlgoliaIndexStrategy;

  return {
    content: contentStrategy,
    products: productStrategy(indices.products),
    "products@price-asc": productStrategy(indices.priceAscending),
    "products@price-desc": productStrategy(indices.priceDescending),
    "query-suggestions": querySuggestionStrategy,
  } satisfies AlgoliaIndexStrategies;
};

const facetFilterField = (filter: string): string => {
  const separator = filter.indexOf(":");
  return separator === -1 ? filter : filter.slice(0, separator);
};

const translateFacet = (
  facet: string,
  fields: AlgoliaProductFacetFields<string>
): string => {
  if (!isProductFacet(facet)) {
    throw new Error(`Unsupported logical Product facet: ${facet}`);
  }
  return fields[facet];
};

const translateFacetFilter = (
  filter: string,
  fields: AlgoliaProductFacetFields<string>
): string => {
  const logicalField = facetFilterField(filter);
  return `${translateFacet(logicalField, fields)}${filter.slice(logicalField.length)}`;
};

const numericFilterPattern =
  /^(?<facet>[^<>=!]+)(?<operator><=|>=|=|<|>)(?<value>.*)$/u;

const translateNumericFilter = (
  filter: string,
  fields: AlgoliaProductFacetFields<string>
): string => {
  const match = numericFilterPattern.exec(filter);
  const facet = match?.groups?.facet;
  const operator = match?.groups?.operator;
  const value = match?.groups?.value ?? "";
  if (facet === undefined || operator === undefined) {
    throw new Error(`Invalid logical Product numeric filter: ${filter}`);
  }
  return `${translateFacet(facet, fields)}${operator}${value}`;
};

const translateFacetFilters = (
  filters: FacetFilters,
  fields: AlgoliaProductFacetFields<string>
): FacetFilters =>
  Array.isArray(filters)
    ? filters.map((filter) => translateFacetFilters(filter, fields))
    : translateFacetFilter(filters, fields);

const translateNumericFilters = (
  filters: NumericFilters,
  fields: AlgoliaProductFacetFields<string>
): NumericFilters =>
  Array.isArray(filters)
    ? filters.map((filter) => translateNumericFilters(filter, fields))
    : translateNumericFilter(filters, fields);

const translateProductParams = (
  params: SearchBatch[number]["params"],
  fields: AlgoliaProductFacetFields<string>
): SearchBatch[number]["params"] => {
  const translated = { ...params };
  if (params.facetFilters !== undefined) {
    translated.facetFilters = translateFacetFilters(
      params.facetFilters,
      fields
    );
  }
  if (params.facets !== undefined) {
    translated.facets = params.facets.map((facet) =>
      translateFacet(facet, fields)
    );
  }
  if (params.numericFilters !== undefined) {
    translated.numericFilters = translateNumericFilters(
      params.numericFilters,
      fields
    );
  }
  return translated;
};

const logicalFieldsByPhysicalField = (
  fields: AlgoliaProductFacetFields<string>
): ReadonlyMap<string, ProductFacet> => {
  const logicalFields = new Map<string, ProductFacet>();
  for (const logicalField of PRODUCT_FACETS) {
    const physicalField = fields[logicalField];
    if (logicalFields.has(physicalField)) {
      throw new Error(
        `Algolia Product facets must use distinct physical fields: ${physicalField}`
      );
    }
    logicalFields.set(physicalField, logicalField);
  }
  return logicalFields;
};

const normalizeFacetFields = <Value>(
  facets: Readonly<Record<string, Value>>,
  logicalFields: ReadonlyMap<string, ProductFacet>
) => {
  const normalized = new Map<ProductFacet, Value>();
  for (const [physicalField, value] of Object.entries(facets)) {
    const logicalField = logicalFields.get(physicalField);
    if (logicalField !== undefined) {
      normalized.set(logicalField, value);
    }
  }
  return Object.fromEntries(normalized);
};

const mapBatch = (
  batch: SearchBatch,
  audience: SearchAudience,
  strategies: AlgoliaIndexStrategies
) =>
  batch.map(({ indexName, params }) => {
    const strategy = strategies[indexName];
    const filters = strategy.audienceFilter?.(audience);
    const productFacetFields = strategy.productFacetFields?.(audience);
    const providerParams =
      productFacetFields === undefined
        ? params
        : translateProductParams(params, productFacetFields);
    const restrictSearchableAttributes =
      strategy.restrictSearchableAttributes?.(audience);
    const analyticsTags = strategy.analyticsTags?.(audience);
    const baseRequest = {
      ...providerParams,
      attributesToRetrieve: [...strategy.attributesToRetrieve],
      indexName: strategy.physicalIndex(audience),
    };
    const request =
      analyticsTags === undefined
        ? baseRequest
        : {
            ...baseRequest,
            analytics: true,
            analyticsTags: [...analyticsTags],
          };
    const requestWithSearchableAttributes =
      restrictSearchableAttributes === undefined
        ? request
        : {
            ...request,
            restrictSearchableAttributes: [...restrictSearchableAttributes],
          };
    return filters === undefined
      ? requestWithSearchableAttributes
      : { ...requestWithSearchableAttributes, filters };
  });

const normalizeHits = (
  strategy: AlgoliaIndexStrategy,
  hits: readonly AlgoliaSearchRecord[],
  audience: SearchAudience
): NormalizedSearchHit[] =>
  hits.map((hit) => strategy.normalizeHit(hit, audience));

export const createAlgoliaSearchProvider = ({
  analyticsTags,
  client,
  contentProjection,
  indices,
  priceCustomerGroupIds,
  productFacetFields = (audience) =>
    algoliaProductFacetFields(
      algoliaConnectorLocale(audience.locale),
      algoliaConnectorCurrency(productAudience(audience).currency)
    ),
  productHitMapping = defaultAlgoliaProductHitMapping,
  querySuggestionHitMapping = defaultQuerySuggestionHitMapping,
}: AlgoliaSearchProviderOptions): SearchProvider => {
  const strategies = createIndexStrategies(
    indices,
    analyticsTags,
    productFacetFields,
    productHitMapping,
    contentProjection,
    querySuggestionHitMapping,
    priceCustomerGroupIds
  );
  return {
    search: async (batch, audience) => {
      const response = await client.search({
        requests: mapBatch(batch, audience, strategies),
      });
      const envelope = decodeAlgoliaSearchResponse(response);
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

        const strategy = strategies[request.indexName];
        const productFields = strategy.productFacetFields?.(audience);
        const logicalFacetFields =
          productFields === undefined
            ? undefined
            : logicalFieldsByPhysicalField(productFields);
        const facets =
          logicalFacetFields === undefined || result.facets === undefined
            ? result.facets
            : normalizeFacetFields(result.facets, logicalFacetFields);
        const facetStats =
          logicalFacetFields === undefined || result.facets_stats === undefined
            ? result.facets_stats
            : normalizeFacetFields(result.facets_stats, logicalFacetFields);
        return {
          ...result,
          facets,
          facets_stats: facetStats,
          hits: normalizeHits(strategy, result.hits, audience),
          index: request.indexName,
        };
      });

      return { results } satisfies SearchBatchResult;
    },
  };
};

export interface AlgoliaEnvironmentSearchProviderOptions {
  readonly contentProjection: ContentSearchProjectionFactory;
}

export const createAlgoliaSearchProviderFromEnvironment = (
  options: AlgoliaEnvironmentSearchProviderOptions
): SearchProvider => {
  let configuredProvider: SearchProvider | undefined;

  const providerFromEnvironment = (): SearchProvider => {
    if (configuredProvider !== undefined) {
      return configuredProvider;
    }

    const config = keys();
    const contentProjection = options.contentProjection(
      contentIndexName(config.ALGOLIA_INDEX_PREFIX)
    );
    configuredProvider = createAlgoliaSearchProvider({
      analyticsTags: createAlgoliaAnalyticsTags(config.ALGOLIA_INDEX_PREFIX),
      client: algoliasearch(
        config.ALGOLIA_APPLICATION_ID,
        config.ALGOLIA_SEARCH_API_KEY
      ),
      contentProjection,
      indices: createAlgoliaSearchIndices(config.ALGOLIA_INDEX_PREFIX),
      priceCustomerGroupIds: parsePriceCustomerGroupIds(
        config.ALGOLIA_PRICE_CUSTOMER_GROUP_IDS
      ),
    });
    return configuredProvider;
  };

  return {
    search: async (batch, audience, signal) =>
      await providerFromEnvironment().search(batch, audience, signal),
  };
};
