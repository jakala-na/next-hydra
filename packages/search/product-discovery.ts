import { productFieldPath } from "@repo/commerce/product";
import type { ProductFieldPath } from "@repo/commerce/product";

interface ProductFacetBase {
  readonly id: string;
  readonly route: string;
  readonly source: ProductFieldPath;
}

export interface ProductRefinementFacetDefinition extends ProductFacetBase {
  readonly control: "refinement-list";
  readonly facetValueSearch?: boolean;
}

export interface ProductRangeFacetDefinition extends ProductFacetBase {
  readonly control: "range";
}

export type ProductFacetDefinition =
  | ProductRangeFacetDefinition
  | ProductRefinementFacetDefinition;

export interface ProductDiscoveryDefinition<
  Facets extends readonly ProductFacetDefinition[],
> {
  readonly facets: Facets;
}

export const defineProductDiscovery = <
  const Facets extends readonly ProductFacetDefinition[],
>(
  definition: ProductDiscoveryDefinition<Facets>
) => definition;

/**
 * Storefront discovery semantics. Product paths are checked against the
 * generated provider-neutral Product Detail model; providers map facet IDs to
 * their own indexed field paths.
 */
export const PRODUCT_DISCOVERY = defineProductDiscovery({
  facets: [
    {
      control: "refinement-list",
      facetValueSearch: true,
      id: "category",
      route: "category",
      source: productFieldPath("categories.id"),
    },
    {
      control: "refinement-list",
      id: "availability",
      route: "availability",
      source: productFieldPath("variants.availability.availableForSale"),
    },
    {
      control: "range",
      id: "price",
      route: "price",
      source: productFieldPath("variants.price.regular.centAmount"),
    },
  ],
} as const);

export type ProductDiscoveryFacet = (typeof PRODUCT_DISCOVERY.facets)[number];
export type ProductFacet = ProductDiscoveryFacet["id"];
export type ProductFacetRoute = ProductDiscoveryFacet["route"];
export type ProductRefinementFacet = Extract<
  ProductDiscoveryFacet,
  { readonly control: "refinement-list" }
>;
export type ProductRangeFacet = Extract<
  ProductDiscoveryFacet,
  { readonly control: "range" }
>;

export type ProductFacetFieldMapping<FieldPath extends string = string> =
  Readonly<Record<ProductFacet, FieldPath>>;

export const PRODUCT_FACETS: readonly ProductFacet[] =
  PRODUCT_DISCOVERY.facets.map(({ id }) => id);

export const PRODUCT_REFINEMENT_FACETS = PRODUCT_DISCOVERY.facets.filter(
  (facet): facet is ProductRefinementFacet =>
    facet.control === "refinement-list"
);

export const PRODUCT_RANGE_FACETS = PRODUCT_DISCOVERY.facets.filter(
  (facet): facet is ProductRangeFacet => facet.control === "range"
);

const productFacetIds = new Set<string>(PRODUCT_FACETS);
const productRefinementFacetIds = new Set<string>(
  PRODUCT_REFINEMENT_FACETS.map(({ id }) => id)
);
const productRangeFacetIds = new Set<string>(
  PRODUCT_RANGE_FACETS.map(({ id }) => id)
);

export const isProductFacet = (value: string): value is ProductFacet =>
  productFacetIds.has(value);

export const isProductRefinementFacet = (
  value: string
): value is ProductRefinementFacet["id"] =>
  productRefinementFacetIds.has(value);

export const isProductRangeFacet = (
  value: string
): value is ProductRangeFacet["id"] => productRangeFacetIds.has(value);
