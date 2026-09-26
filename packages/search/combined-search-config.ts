import { searchCollections } from "./collections";

export const COMBINED_SEARCH_PREVIEW_SIZE = 3;
export const COMBINED_SEARCH_PAGE_SIZE = 6;

export const combinedSearchConfigure = (indexName: string, tab: string) => ({
  attributesToRetrieve: [
    ...(searchCollections.find(
      (collection) => collection.indexName === indexName
    )?.attributes ?? []),
  ],
  hitsPerPage:
    tab === "all" && searchCollections.length > 1
      ? COMBINED_SEARCH_PREVIEW_SIZE
      : COMBINED_SEARCH_PAGE_SIZE,
});
