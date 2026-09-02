import { ProductCard } from "@repo/commerce/product";
import { Schema } from "effect";
import type { SearchClient } from "instantsearch.js";

export const PRODUCT_INDEX_ALIASES = [
  "products",
  "products@price-asc",
  "products@price-desc",
] as const;

export type ProductIndexAlias = (typeof PRODUCT_INDEX_ALIASES)[number];

export const PRODUCT_FACETS = ["category", "availability", "price"] as const;
export type ProductFacet = (typeof PRODUCT_FACETS)[number];

export const PRODUCT_HIT_ATTRIBUTES = [
  "objectID",
  "productCard",
  "categories",
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

type InstantSearchRequest = Parameters<SearchClient["search"]>[0][number];

export type SearchRequest = Omit<InstantSearchRequest, "indexName"> & {
  readonly indexName: ProductIndexAlias;
};
export type SearchBatch = SearchRequest[];
export type SearchBatchResult = Awaited<ReturnType<SearchClient["search"]>>;

export interface SearchAudience {
  readonly storeKey: string;
  readonly locale: string;
  readonly currency: string;
  readonly customerSegmentKeys: readonly string[];
  readonly distributionChannelKeys: readonly string[];
  readonly supplyChannelKeys: readonly string[];
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
