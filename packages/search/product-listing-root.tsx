import type { Locale } from "@repo/i18n";
import type { SearchClient, UiState } from "instantsearch.js";
import { InstantSearch } from "react-instantsearch";
import type { InstantSearchProps } from "react-instantsearch";

import type { ProductListingRouteState } from "./product-listing-routing";
import { ProductListingView } from "./product-listing-view";

export interface ProductListingRootProps {
  readonly initialUiState?: UiState;
  readonly locale: Locale;
  readonly routing?: InstantSearchProps<
    UiState,
    ProductListingRouteState
  >["routing"];
  readonly searchClient: SearchClient;
}

export function ProductListingRoot({
  initialUiState,
  locale,
  routing,
  searchClient,
}: ProductListingRootProps) {
  return (
    <InstantSearch<UiState, ProductListingRouteState>
      future={{ preserveSharedStateOnUnmount: true }}
      indexName="products"
      initialUiState={initialUiState}
      routing={routing}
      searchClient={searchClient}
    >
      <ProductListingView locale={locale} />
    </InstantSearch>
  );
}
