import { contentCollection } from "./content-collection";
import { productCollection } from "./product-collection";
import type { SearchCollection } from "./search-collection";

export const searchCollections: readonly [
  SearchCollection,
  ...SearchCollection[],
] = [productCollection, contentCollection];
