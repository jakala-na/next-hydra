import type { SearchAudience } from "@repo/search/contract";
import type { ProductSearchHit } from "@repo/search/product-contract";

import { createAlgoliaAnalyticsTags } from "./analytics-tags";
import {
  algoliaConnectorCurrency,
  algoliaConnectorLocale,
} from "./connector/commercetools/generated-product";
import { createAlgoliaSearchIndices } from "./index-graph";
import {
  resolvePriceAudienceIds,
  parsePriceCustomerGroupIds,
} from "./price-audience";
import {
  algoliaProductFacetFields,
  algoliaProductFieldPath,
} from "./product-facet-fields";
import type { AlgoliaProductFacetFields } from "./product-facet-fields";
import { defaultAlgoliaProductHitMapping } from "./product-hit";
import { keys } from "./product-keys";
import {
  createAlgoliaSearchProvider as createCoreProvider,
  filterValue,
} from "./provider";
import type {
  AlgoliaSearchProviderOptions as CoreOptions,
  AlgoliaIndexStrategy,
  AlgoliaSearchIndexResolver,
} from "./provider";
import type { AlgoliaSearchRecord } from "./search-record";

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

export interface AlgoliaSearchIndices {
  readonly products: AlgoliaSearchIndexResolver;
  readonly priceAscending: AlgoliaSearchIndexResolver;
  readonly priceDescending: AlgoliaSearchIndexResolver;
  readonly querySuggestions: AlgoliaSearchIndexResolver;
}
export interface AlgoliaProductOptions {
  readonly indices: AlgoliaSearchIndices;
  readonly priceCustomerGroupIds: readonly string[];
  readonly analyticsTags?: CoreOptions["analyticsTags"];
  readonly productFacetFields?: AlgoliaProductFacetFieldsResolver;
  readonly productHitMapping?: AlgoliaProductHitMapping;
}
export const createProductStrategies = ({
  indices,
  priceCustomerGroupIds,
  analyticsTags,
  productFacetFields = (audience) =>
    algoliaProductFacetFields(
      algoliaConnectorLocale(audience.locale),
      algoliaConnectorCurrency(productAudience(audience).currency)
    ),
  productHitMapping = defaultAlgoliaProductHitMapping,
}: AlgoliaProductOptions) => {
  const strategy = (
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
  return {
    products: strategy(indices.products),
    "products@price-asc": strategy(indices.priceAscending),
    "products@price-desc": strategy(indices.priceDescending),
  };
};
export const productStrategiesFromEnvironment = (prefix: string | undefined) =>
  createProductStrategies({
    analyticsTags: createAlgoliaAnalyticsTags(prefix),
    indices: createAlgoliaSearchIndices(prefix),
    priceCustomerGroupIds: parsePriceCustomerGroupIds(
      keys().ALGOLIA_PRICE_CUSTOMER_GROUP_IDS
    ),
  });
export const createAlgoliaSearchProvider = (
  options: CoreOptions & AlgoliaProductOptions
) =>
  createCoreProvider({
    ...options,
    additionalStrategies: createProductStrategies(options),
  });
