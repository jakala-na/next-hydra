export type {
  ContentIndexAlias,
  ContentSearchCard,
  ContentSearchDocument,
  ContentSearchHit,
  ProductSearchAudience,
  QuerySuggestionIndexAlias,
  QuerySuggestionSearchHit,
  SearchAudience,
  SearchBatch,
  SearchBatchResult,
  SearchIndexAlias,
  SearchProvider,
  SearchRequest,
} from "./contract";
export {
  CONTENT_INDEX_ALIASES,
  QUERY_SUGGESTION_INDEX_ALIASES,
} from "./contract";
export {
  createCanonicalContentSearchProjection,
  defineContentSearchProjection,
} from "./content-search-projection";
export type {
  ContentSearchFilter,
  ContentSearchProjection,
  ContentSearchProjectionFactory,
  ContentSearchableAttribute,
} from "./content-search-projection";
