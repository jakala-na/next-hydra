import recipe from "../recipes/product-collection.json" with { type: "json" };
import type { SearchContentTypeExtension } from "./types.ts";

export const productCollectionSearchInstructions = {
  extend: recipe.contentType.uid,
  instructions: [
    `${recipe.contentType.block.title} is a block on this content type, not a separate searchable entry. Assign its Commerce category and publish the parent page. Catalog product records are indexed separately by the Commerce connector.`,
  ],
} satisfies SearchContentTypeExtension;
