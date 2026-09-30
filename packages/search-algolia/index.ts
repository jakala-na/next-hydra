export {
  createAlgoliaSearchProvider,
  createAlgoliaSearchProviderFromEnvironment,
} from "./provider";
export { createSearchProvider } from "./composition";
export { contentIndexSettings } from "./content-mapping";
export type {
  AlgoliaAnalyticsTagsResolver,
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
