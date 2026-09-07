import { PRODUCT_HIT_ATTRIBUTES } from "./contract";
import { PRODUCT_DISCOVERY } from "./product-discovery";
import type { ProductRefinementFacet } from "./product-discovery";
import { PRODUCT_SORTS } from "./product-listing-routing";

export const PRODUCT_LISTING_CONFIGURE = {
  attributesToRetrieve: [...PRODUCT_HIT_ATTRIBUTES],
  hitsPerPage: 12,
};

const PRODUCT_LISTING_REFINEMENT_LIST = {
  limit: 20,
  sortBy: ["name:asc" as const],
};

export const productListingRefinementListOptions = (
  attribute: ProductRefinementFacet["id"]
) =>
  attribute === "category"
    ? {
        ...PRODUCT_LISTING_REFINEMENT_LIST,
        limit: 5,
        showMore: true,
        showMoreLimit: 20,
      }
    : PRODUCT_LISTING_REFINEMENT_LIST;

export const PRODUCT_LISTING_FACETS = PRODUCT_DISCOVERY.facets;

export const PRODUCT_LISTING_SORT_ITEMS = PRODUCT_SORTS.map(
  ({ label, value }) => ({ label, value })
);
