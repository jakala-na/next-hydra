import { ProductCard } from "@repo/commerce/product";
import { Schema } from "effect";
import type { SearchClient } from "instantsearch.js";

export { PRODUCT_FACETS } from "./product-discovery";
export type {
  ProductFacet,
  ProductFacetFieldMapping,
} from "./product-discovery";

export const PRODUCT_INDEX_ALIASES = [
  "products",
  "products@price-asc",
  "products@price-desc",
] as const;

export type ProductIndexAlias = (typeof PRODUCT_INDEX_ALIASES)[number];

export const CONTENT_INDEX_ALIASES = ["content"] as const;
export type ContentIndexAlias = (typeof CONTENT_INDEX_ALIASES)[number];

export const QUERY_SUGGESTION_INDEX_ALIASES = ["query-suggestions"] as const;
export type QuerySuggestionIndexAlias =
  (typeof QUERY_SUGGESTION_INDEX_ALIASES)[number];

export const SEARCH_INDEX_ALIASES = [
  ...PRODUCT_INDEX_ALIASES,
  ...CONTENT_INDEX_ALIASES,
  ...QUERY_SUGGESTION_INDEX_ALIASES,
] as const;
export type SearchIndexAlias = (typeof SEARCH_INDEX_ALIASES)[number];

export const PRODUCT_HIT_ATTRIBUTES = [
  "objectID",
  "productCard",
  "categories",
] as const;

export const CONTENT_HIT_ATTRIBUTES = ["objectID", "contentCard"] as const;
export const QUERY_SUGGESTION_HIT_ATTRIBUTES = [
  "objectID",
  "query",
  "popularity",
  "nb_words",
] as const;
export const SEARCH_HIT_ATTRIBUTES = [
  ...PRODUCT_HIT_ATTRIBUTES,
  ...CONTENT_HIT_ATTRIBUTES,
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

export const ContentSearchImage = Schema.Struct({
  altText: Schema.String,
  height: Schema.optional(Schema.Int),
  url: Schema.NonEmptyString,
  width: Schema.optional(Schema.Int),
});
export type ContentSearchImage = typeof ContentSearchImage.Type;

export const ContentSearchCard = Schema.Struct({
  contentType: Schema.optional(Schema.NonEmptyString),
  id: Schema.NonEmptyString,
  image: Schema.optional(ContentSearchImage),
  path: Schema.String.pipe(
    Schema.check(
      Schema.isMinLength(1),
      Schema.isPattern(/^\/(?!\/)/u, {
        message: "Content paths must be application-relative",
      })
    )
  ),
  publishedAt: Schema.optional(Schema.String),
  summary: Schema.String,
  title: Schema.NonEmptyString,
});
export type ContentSearchCard = typeof ContentSearchCard.Type;

export const ContentSearchHit = Schema.Struct({
  contentCard: ContentSearchCard,
  objectID: Schema.NonEmptyString,
});
export type ContentSearchHit = typeof ContentSearchHit.Type;

export const decodeContentSearchHit =
  Schema.decodeUnknownSync(ContentSearchHit);

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
  /** Opaque pricing audience IDs resolved by Commerce; empty means public. */
  readonly priceAudienceIds: readonly string[];
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
 * Logical Product discovery document shared by search providers. A provider
 * may store a richer physical projection and localize it into this contract
 * before returning an InstantSearch response.
 */
export interface ProductSearchDocument extends ProductSearchHit {
  /** Provider index projection derived from Product Card availability. */
  readonly availability: "in-stock" | "out-of-stock";
  /** Provider index projection of ProductSearchHit.categories[].key. */
  readonly category: readonly string[];
  /** Provider index projection in major currency units for range and sort. */
  readonly price?: number;
  /** Provider projection IDs; the public fallback is represented as `public`. */
  readonly priceAudienceIds: readonly string[];
}

/** Canonical Content document projected from the selected CMS indexer. */
export interface ContentSearchDocument extends ContentSearchHit {
  readonly locales: readonly string[];
}

export const isProductIndexAlias = (
  indexName: SearchIndexAlias
): indexName is ProductIndexAlias =>
  PRODUCT_INDEX_ALIASES.some((candidate) => candidate === indexName);

/** Indices whose physical destination depends on the active commerce Store. */
export const requiresProductSearchAudience = (
  indexName: SearchIndexAlias
): boolean =>
  isProductIndexAlias(indexName) || indexName === "query-suggestions";

export const isContentIndexAlias = (
  indexName: SearchIndexAlias
): indexName is ContentIndexAlias => indexName === "content";
