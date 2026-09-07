export {
  createAlgoliaSearchProvider,
  createAlgoliaSearchProviderFromEnvironment,
} from "./provider";
export { createSearchProvider } from "./composition";
export { contentIndexSettings } from "./content-mapping";
export {
  algoliaProductFieldPath,
  algoliaProductFacetFields,
  defineAlgoliaProductFacetFields,
} from "./product-facet-fields";
export type { AlgoliaProductFacetFields } from "./product-facet-fields";
export type {
  AlgoliaConnectorLocale,
  AlgoliaProductFieldPath,
  AlgoliaProductRecord,
} from "./connector/commercetools/generated-product";
export type {
  AlgoliaAnalyticsTagsResolver,
  AlgoliaProductHitMapping,
  AlgoliaProductFacetFieldsResolver,
  AlgoliaQuerySuggestionHitMapping,
  AlgoliaEnvironmentSearchProviderOptions,
  AlgoliaSearchIndexResolver,
  AlgoliaSearchIndices,
  AlgoliaSearchProviderOptions,
} from "./provider";
export {
  algoliaSearchAnalyticsTags,
  createAlgoliaAnalyticsTags,
} from "./analytics-tags";
export type { AlgoliaSearchRecord } from "./search-record";
