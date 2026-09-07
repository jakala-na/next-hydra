import type { CombinedSearchTab } from "./combined-search-routing";
import { CONTENT_HIT_ATTRIBUTES, PRODUCT_HIT_ATTRIBUTES } from "./contract";

export const COMBINED_SEARCH_PREVIEW_SIZE = 3;
export const COMBINED_SEARCH_PAGE_SIZE = 6;

const hitsPerPage = (tab: CombinedSearchTab): number =>
  tab === "all" ? COMBINED_SEARCH_PREVIEW_SIZE : COMBINED_SEARCH_PAGE_SIZE;

export const combinedProductSearchConfigure = (tab: CombinedSearchTab) => ({
  attributesToRetrieve: [...PRODUCT_HIT_ATTRIBUTES],
  hitsPerPage: hitsPerPage(tab),
});

export const combinedContentSearchConfigure = (tab: CombinedSearchTab) => ({
  attributesToRetrieve: [...CONTENT_HIT_ATTRIBUTES],
  hitsPerPage: hitsPerPage(tab),
});
