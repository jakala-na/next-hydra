import type { SearchCollection } from "./search-collection";
/*{% echo imports %}*/

export const searchCollections: readonly [
  SearchCollection,
  ...SearchCollection[],
] = [/*{% echo slots.collections %}*/];
