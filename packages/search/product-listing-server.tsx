import "server-only";
import type { Widget } from "instantsearch.js";
import {
  connectConfigure,
  connectHits,
  connectPagination,
  connectRange,
  connectRefinementList,
  connectSearchBox,
  connectSortBy,
  connectStats,
} from "instantsearch.js/es/connectors";
import type { InstantSearchServerState } from "react-instantsearch";

import type { SearchAudience, SearchProvider } from "./contract";
import { getInstantSearchServerState } from "./instant-search-server";
import {
  PRODUCT_LISTING_CONFIGURE,
  PRODUCT_LISTING_FACETS,
  PRODUCT_LISTING_RANGE_ATTRIBUTE,
  PRODUCT_LISTING_REFINEMENT_LIST,
  PRODUCT_LISTING_SORT_ITEMS,
} from "./product-listing-config";
import type { ProductListingRouteState } from "./product-listing-routing";
import { productListingStateMapping } from "./product-listing-routing";

export interface ProductListingServerStateOptions {
  readonly audience: SearchAudience;
  readonly provider: SearchProvider;
  readonly routeState: ProductListingRouteState;
}

const renderNothing = () => undefined;

/**
 * Mirrors the state-producing widgets in ProductListingView without rendering
 * a second React tree. InstantSearch therefore remains the authority for its
 * multi-query and disjunctive-facet request plan.
 */
const createProductListingServerWidgets = (): Widget[] => [
  connectConfigure(renderNothing)({
    searchParameters: PRODUCT_LISTING_CONFIGURE,
  }),
  connectSearchBox(renderNothing)({}),
  connectSortBy(renderNothing)({ items: PRODUCT_LISTING_SORT_ITEMS }),
  ...PRODUCT_LISTING_FACETS.map(({ attribute }) =>
    connectRefinementList(renderNothing)({
      attribute,
      ...PRODUCT_LISTING_REFINEMENT_LIST,
    })
  ),
  connectRange(renderNothing)({
    attribute: PRODUCT_LISTING_RANGE_ATTRIBUTE,
  }),
  connectPagination(renderNothing)({}),
  connectHits(renderNothing)({}),
  connectStats(renderNothing)({}),
];

/**
 * Runs InstantSearch's headless server lifecycle so the provider receives the
 * exact request batch produced by the UI widgets. This avoids both a synthetic
 * one-query approximation and an internal HTTP request from the Server
 * Component to its own proxy route.
 */
export async function getProductListingServerState({
  audience,
  provider,
  routeState,
}: ProductListingServerStateOptions): Promise<InstantSearchServerState> {
  return await getInstantSearchServerState({
    audience,
    indexName: "products",
    initialUiState: productListingStateMapping.routeToState(routeState),
    provider,
    widgets: createProductListingServerWidgets(),
  });
}
