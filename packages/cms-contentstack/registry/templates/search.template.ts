import { searchableContentTypes } from "./search-content-types";
import { createContentstackSearch } from "./search-provider";
/*{% echo imports %}*/

export { contentIndexingOperations } from "./search-provider";

export const {
  createContentIndexingHandoff,
  createContentSearchProjection,
  loadContentSearchProjection,
} = createContentstackSearch(searchableContentTypes);
