import { autocompleteContentHref } from "./autocomplete-routing";
import { CONTENT_HIT_ATTRIBUTES, decodeContentSearchHit } from "./contract";
import type { SearchCollection } from "./search-collection";

export const contentCollection: SearchCollection = {
  aliases: ["content"],
  attributes: CONTENT_HIT_ATTRIBUTES,
  autocomplete: (hit, routes) => {
    const content = decodeContentSearchHit(hit);
    return {
      href: autocompleteContentHref(content, routes),
      title: content.contentCard.title,
      description: content.contentCard.summary,
      image: content.contentCard.image,
    };
  },
  autocompleteLabel: "Content",
  autocompleteOrder: 0,
  facets: [],
  fallbackSymbol: "§",
  id: "resources",
  indexName: "content",
  label: "Resources",
  layout: "row",
  paginationLabel: "Resource results pagination",
  resultType: "resource",
};
