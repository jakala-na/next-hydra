import "server-only";
import type {
  ProductIndexAlias,
  ProductSearchHit,
  SearchAudience,
  SearchBatch,
  SearchBatchResult,
  SearchProvider,
} from "@repo/search/contract";
import {
  PRODUCT_HIT_ATTRIBUTES,
  decodeProductSearchHit,
} from "@repo/search/contract";
import { algoliasearch } from "algoliasearch";
import type { Algoliasearch } from "algoliasearch";
import { z } from "zod";

import { keys } from "./keys";

export interface AlgoliaProductIndices {
  readonly products: string;
  readonly priceAscending: string;
  readonly priceDescending: string;
}

export interface AlgoliaSearchProviderOptions {
  readonly client: Pick<Algoliasearch, "search">;
  readonly indices: AlgoliaProductIndices;
  readonly productHitMapping?: AlgoliaProductHitMapping;
}

const algoliaProductRecordSchema = z.record(z.string(), z.unknown());
export type AlgoliaProductRecord = z.infer<typeof algoliaProductRecordSchema>;

export interface AlgoliaProductHitMapping {
  readonly attributesToRetrieve: readonly string[];
  readonly toProductSearchHit: (
    record: AlgoliaProductRecord
  ) => ProductSearchHit;
}

const defaultProductHitMapping: AlgoliaProductHitMapping = {
  attributesToRetrieve: PRODUCT_HIT_ATTRIBUTES,
  toProductSearchHit: decodeProductSearchHit,
};

const responseEnvelopeSchema = z.object({
  results: z.array(
    z
      .object({
        hits: z.array(algoliaProductRecordSchema),
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

export const audienceFilter = (audience: SearchAudience): string =>
  [
    filterValue("storeKeys", audience.storeKey),
    filterValue("locales", audience.locale),
    filterValue("currencies", audience.currency),
    filterValues("customerSegmentKeys", audience.customerSegmentKeys),
    filterValues("distributionChannelKeys", audience.distributionChannelKeys),
    filterValues("supplyChannelKeys", audience.supplyChannelKeys),
  ].join(" AND ");

const physicalIndex = (
  alias: ProductIndexAlias,
  indices: AlgoliaProductIndices
): string => {
  const physicalIndices = {
    products: indices.products,
    "products@price-asc": indices.priceAscending,
    "products@price-desc": indices.priceDescending,
  } satisfies Record<ProductIndexAlias, string>;

  return physicalIndices[alias];
};

const mapBatch = (
  batch: SearchBatch,
  audience: SearchAudience,
  indices: AlgoliaProductIndices,
  productHitMapping: AlgoliaProductHitMapping
) =>
  batch.map(({ indexName, params }) => ({
    ...params,
    attributesToRetrieve: [...productHitMapping.attributesToRetrieve],
    filters: audienceFilter(audience),
    indexName: physicalIndex(indexName, indices),
  }));

export const createAlgoliaSearchProvider = ({
  client,
  indices,
  productHitMapping = defaultProductHitMapping,
}: AlgoliaSearchProviderOptions): SearchProvider => ({
  search: async (batch, audience) => {
    const response = await client.search({
      requests: mapBatch(batch, audience, indices, productHitMapping),
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
        hits: result.hits.map((hit) =>
          decodeProductSearchHit(productHitMapping.toProductSearchHit(hit))
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
    },
  });
  return configuredProvider;
};

export const searchProvider: SearchProvider = {
  search: async (batch, audience, signal) =>
    await providerFromEnvironment().search(batch, audience, signal),
};
