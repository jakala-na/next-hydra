import type { SearchAutocompleteRoutes } from "./autocomplete-routing";
import type { SearchHit } from "./contract";

export type { SearchHit } from "./contract";

export interface SearchCollection {
  readonly id: string;
  readonly indexName: string;
  readonly label: string;
  readonly paginationLabel: string;
  readonly autocompleteLabel: string;
  readonly autocompleteOrder: number;
  readonly fallbackSymbol: string;
  readonly attributes: readonly string[];
  readonly aliases: readonly string[];
  readonly facets: readonly {
    readonly id: string;
    readonly control: "range" | "refinement-list";
  }[];
  readonly layout: "grid" | "row";
  readonly resultType: string;
  readonly autocomplete: (
    hit: SearchHit,
    routes: SearchAutocompleteRoutes
  ) => {
    readonly href: string;
    readonly title: string;
    readonly description: string;
    readonly image?: { readonly url: string; readonly altText?: string };
  };
}
