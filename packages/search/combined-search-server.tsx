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

import {
  combinedProductSearchConfigure,
  combinedContentSearchConfigure,
} from "./combined-search-config";
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
  const rootIsResource = tab === "resources";
  const widgets: ServerWidget[] = [
    connectConfigure(renderNothing)({
      searchParameters: rootIsResource
        ? combinedContentSearchConfigure(tab)
        : combinedProductSearchConfigure(tab),
    }),
    connectSearchBox(renderNothing)({}),
    ...resultWidgets(tab !== "all"),
  ];

  if (tab === "all") {
    const content = index({ indexName: "content" });
    content.addWidgets([
      connectConfigure(renderNothing)({
        searchParameters: combinedContentSearchConfigure(tab),
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
