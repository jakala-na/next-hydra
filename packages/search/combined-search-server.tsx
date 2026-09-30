import "server-only";
import type { IndexWidget, Widget } from "instantsearch.js";
import {
  connectConfigure,
  connectHits,
  connectPagination,
  connectSearchBox,
  connectStats,
} from "instantsearch.js/es/connectors";
import index from "instantsearch.js/es/widgets/index/index";
import type { InstantSearchServerState } from "react-instantsearch";

import { searchCollections } from "./collections";
import { combinedSearchConfigure } from "./combined-search-config";
import type {
  CombinedSearchRouteState,
  CombinedSearchTab,
} from "./combined-search-routing";
import {
  combinedSearchRootIndex,
  createCombinedSearchStateMapping,
} from "./combined-search-routing";
import type { SearchAudience, SearchProvider } from "./contract";
import { getInstantSearchServerState } from "./instant-search-server";

export interface CombinedSearchServerStateOptions {
  readonly audience: SearchAudience;
  readonly provider: SearchProvider;
  readonly routeState: CombinedSearchRouteState;
  readonly tab: CombinedSearchTab;
}

const renderNothing = () => undefined;
type ServerWidget = IndexWidget | Widget;

const resultWidgets = (withPagination: boolean): ServerWidget[] => [
  connectHits(renderNothing)({}),
  connectStats(renderNothing)({}),
  ...(withPagination ? [connectPagination(renderNothing)({})] : []),
];

const createCombinedSearchServerWidgets = (
  tab: CombinedSearchTab
): ServerWidget[] => {
  const indexName = combinedSearchRootIndex(tab);
  const widgets: ServerWidget[] = [
    connectConfigure(renderNothing)({
      searchParameters: combinedSearchConfigure(indexName, tab),
    }),
    connectSearchBox(renderNothing)({}),
    ...resultWidgets(tab !== "all" || searchCollections.length === 1),
  ];

  for (const collection of tab === "all" ? searchCollections.slice(1) : []) {
    const content = index({ indexName: collection.indexName });
    content.addWidgets([
      connectConfigure(renderNothing)({
        searchParameters: combinedSearchConfigure(collection.indexName, tab),
      }),
      ...resultWidgets(false),
    ]);
    widgets.push(content);
  }

  return widgets;
};

export async function getCombinedSearchServerState({
  audience,
  provider,
  routeState,
  tab,
}: CombinedSearchServerStateOptions): Promise<InstantSearchServerState> {
  return await getInstantSearchServerState({
    audience,
    indexName: combinedSearchRootIndex(tab),
    initialUiState:
      createCombinedSearchStateMapping(tab).routeToState(routeState),
    provider,
    widgets: createCombinedSearchServerWidgets(tab),
  });
}
