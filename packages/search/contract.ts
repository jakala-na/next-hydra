import { ProductCard } from "@repo/commerce/product";
import { Schema } from "effect";
import type { SearchClient } from "instantsearch.js";

export const PRODUCT_INDEX_ALIASES = [
  "products",
  "products@price-asc",
  "products@price-desc",
] as const;

export type ProductIndexAlias = (typeof PRODUCT_INDEX_ALIASES)[number];

export const RESOURCE_INDEX_ALIASES = ["resources"] as const;
export type ResourceIndexAlias = (typeof RESOURCE_INDEX_ALIASES)[number];

export const QUERY_SUGGESTION_INDEX_ALIASES = ["query-suggestions"] as const;
export type QuerySuggestionIndexAlias =
  (typeof QUERY_SUGGESTION_INDEX_ALIASES)[number];

export const SEARCH_INDEX_ALIASES = [
  ...PRODUCT_INDEX_ALIASES,
  ...RESOURCE_INDEX_ALIASES,
  ...QUERY_SUGGESTION_INDEX_ALIASES,
] as const;
export type SearchIndexAlias = (typeof SEARCH_INDEX_ALIASES)[number];

export const PRODUCT_FACETS = ["category", "availability", "price"] as const;
export type ProductFacet = (typeof PRODUCT_FACETS)[number];

export const PRODUCT_HIT_ATTRIBUTES = [
  "objectID",
  "productCard",
  "categories",
] as const;

export const RESOURCE_HIT_ATTRIBUTES = ["objectID", "resourceCard"] as const;
export const QUERY_SUGGESTION_HIT_ATTRIBUTES = [
  "objectID",
  "query",
  "popularity",
  "nb_words",
] as const;
export const SEARCH_HIT_ATTRIBUTES = [
  ...PRODUCT_HIT_ATTRIBUTES,
  ...RESOURCE_HIT_ATTRIBUTES,
  ...QUERY_SUGGESTION_HIT_ATTRIBUTES,
] as const;

export const ProductSearchCategory = Schema.Struct({
  key: Schema.NonEmptyString,
  label: Schema.NonEmptyString,
});
export type ProductSearchCategory = typeof ProductSearchCategory.Type;

export const ProductSearchHit = Schema.Struct({
  categories: Schema.Array(ProductSearchCategory),
  objectID: Schema.NonEmptyString,
  productCard: ProductCard,
});
export type ProductSearchHit = typeof ProductSearchHit.Type;

export const decodeProductSearchHit =
  Schema.decodeUnknownSync(ProductSearchHit);

export const ResourceSearchImage = Schema.Struct({
  altText: Schema.String,
  height: Schema.optional(Schema.Int),
  url: Schema.NonEmptyString,
  width: Schema.optional(Schema.Int),
});
export type ResourceSearchImage = typeof ResourceSearchImage.Type;

export const ResourceSearchCard = Schema.Struct({
  id: Schema.NonEmptyString,
  image: Schema.optional(ResourceSearchImage),
  path: Schema.String.pipe(
    Schema.check(
      Schema.isMinLength(1),
      Schema.isPattern(/^\/(?!\/)/u, {
        message: "Resource paths must be application-relative",
      })
    )
  ),
  publishedAt: Schema.optional(Schema.String),
  summary: Schema.String,
  title: Schema.NonEmptyString,
});
export type ResourceSearchCard = typeof ResourceSearchCard.Type;

export const ResourceSearchHit = Schema.Struct({
  objectID: Schema.NonEmptyString,
  resourceCard: ResourceSearchCard,
});
export type ResourceSearchHit = typeof ResourceSearchHit.Type;

export const decodeResourceSearchHit =
  Schema.decodeUnknownSync(ResourceSearchHit);

export const QuerySuggestionSearchHit = Schema.Struct({
  nb_words: Schema.Int.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(1))),
  objectID: Schema.NonEmptyString,
  popularity: Schema.Finite,
  query: Schema.NonEmptyString,
});
export type QuerySuggestionSearchHit = typeof QuerySuggestionSearchHit.Type;

export const decodeQuerySuggestionSearchHit = Schema.decodeUnknownSync(
  QuerySuggestionSearchHit
);

type InstantSearchRequest = Parameters<SearchClient["search"]>[0][number];

export type SearchRequest = Omit<InstantSearchRequest, "indexName"> & {
  readonly indexName: SearchIndexAlias;
};
export type SearchBatch = SearchRequest[];
export type SearchBatchResult = Awaited<ReturnType<SearchClient["search"]>>;

export interface ProductSearchAudience {
  readonly storeKey: string;
  readonly currency: string;
  readonly customerSegmentKeys: readonly string[];
  readonly distributionChannelKeys: readonly string[];
  readonly supplyChannelKeys: readonly string[];
}

export interface SearchAudience {
  readonly locale: string;
  readonly product?: ProductSearchAudience;
}

export interface SearchProvider {
  readonly search: (
    batch: SearchBatch,
    audience: SearchAudience,
    signal?: AbortSignal
  ) => Promise<SearchBatchResult>;
}

/**
 * Canonical Product document projected into every supported search provider.
 * Index publication is intentionally separate from the query protocol.
 */
export interface ProductSearchDocument extends ProductSearchHit {
  /** Provider index projection derived from Product Card availability. */
  readonly availability: "in-stock" | "out-of-stock";
  /** Provider index projection of ProductSearchHit.categories[].key. */
  readonly category: readonly string[];
  /** Provider index projection in major currency units for range and sort. */
  readonly price?: number;
  readonly storeKeys: readonly string[];
  readonly locales: readonly string[];
  readonly currencies: readonly string[];
  readonly customerSegmentKeys: readonly string[];
  readonly distributionChannelKeys: readonly string[];
  readonly supplyChannelKeys: readonly string[];
}

/** Canonical Resource document projected from the selected CMS indexer. */
export interface ResourceSearchDocument extends ResourceSearchHit {
  readonly locales: readonly string[];
}

export const isProductIndexAlias = (
  indexName: SearchIndexAlias
): indexName is ProductIndexAlias =>
  PRODUCT_INDEX_ALIASES.some((candidate) => candidate === indexName);

export const isResourceIndexAlias = (
  indexName: SearchIndexAlias
): indexName is ResourceIndexAlias => indexName === "resources";
