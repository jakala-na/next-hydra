import { appendSearchPath } from "./autocomplete-routing";
import {
  PRODUCT_HIT_ATTRIBUTES,
  PRODUCT_INDEX_ALIASES,
  decodeProductSearchHit,
} from "./product-contract";
import { PRODUCT_DISCOVERY } from "./product-discovery";
import type { SearchCollection } from "./search-collection";

export const productCollection: SearchCollection = {
  aliases: PRODUCT_INDEX_ALIASES,
  attributes: PRODUCT_HIT_ATTRIBUTES,
  autocomplete: (hit, routes) => {
    const product = decodeProductSearchHit(hit);
    if (routes.productPathPrefix === undefined) {
      throw new Error("Product search requires a product route");
    }
    return {
      href: appendSearchPath(
        routes.productPathPrefix,
        product.productCard.slug
      ),
      title: product.productCard.title,
      description: product.categories[0]?.label ?? "Product",
      image: product.productCard.featuredImage,
    };
  },
  autocompleteLabel: "Products",
  autocompleteOrder: 1,
  facets: PRODUCT_DISCOVERY.facets,
  fallbackSymbol: "◇",
  id: "products",
  indexName: "products",
  label: "Products",
  layout: "grid",
  paginationLabel: "Product results pagination",
  resultType: "product",
};
