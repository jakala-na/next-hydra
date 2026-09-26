import { ProductCard } from "@repo/commerce/product";
import { Schema } from "effect";

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

export const isProductIndexAlias = (
  indexName: string
): indexName is ProductIndexAlias =>
  PRODUCT_INDEX_ALIASES.some((candidate) => candidate === indexName);

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
