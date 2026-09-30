import type { Locale } from "@repo/i18n";
import type { SearchClient, UiState } from "instantsearch.js";
import { InstantSearch } from "react-instantsearch";
import type { InstantSearchProps } from "react-instantsearch";

import type {
  CombinedSearchRouteState,
  CombinedSearchTab,
} from "./combined-search-routing";
import { combinedSearchRootIndex } from "./combined-search-routing";
import { CombinedSearchView } from "./combined-search-view";

export interface CombinedSearchRootProps {
  readonly locale: Locale;
  readonly routing: InstantSearchProps<
    UiState,
    CombinedSearchRouteState
  >["routing"];
  readonly searchClient: SearchClient;
  readonly tab: CombinedSearchTab;
}

export function CombinedSearchRoot({
  locale,
  routing,
  searchClient,
  tab,
}: CombinedSearchRootProps) {
  return (
    <InstantSearch<UiState, CombinedSearchRouteState>
      future={{ preserveSharedStateOnUnmount: true }}
      indexName={combinedSearchRootIndex(tab)}
      routing={routing}
      searchClient={searchClient}
    >
      <CombinedSearchView locale={locale} tab={tab} />
    </InstantSearch>
  );
}
