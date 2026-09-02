import { PRODUCT_HIT_ATTRIBUTES } from "./contract";
import { PRODUCT_SORTS } from "./product-listing-routing";

export const PRODUCT_LISTING_CONFIGURE = {
  attributesToRetrieve: [...PRODUCT_HIT_ATTRIBUTES],
  hitsPerPage: 12,
};

export const PRODUCT_LISTING_REFINEMENT_LIST = {
  limit: 20,
  sortBy: ["name:asc" as const],
};

export const PRODUCT_LISTING_FACETS = [
  { attribute: "category", label: "Category" },
  { attribute: "availability", label: "Availability" },
] as const;

export const PRODUCT_LISTING_RANGE_ATTRIBUTE = "price" as const;

export const PRODUCT_LISTING_SORT_ITEMS = PRODUCT_SORTS.map(
  ({ label, value }) => ({ label, value })
);
