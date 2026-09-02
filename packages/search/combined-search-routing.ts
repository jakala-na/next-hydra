import type { IndexUiState, StateMapping, UiState } from "instantsearch.js";

import type { SearchIndexAlias } from "./contract";

export const COMBINED_SEARCH_TABS = ["all", "products", "resources"] as const;
export type CombinedSearchTab = (typeof COMBINED_SEARCH_TABS)[number];
type RouteValue = string | number | string[] | undefined;

export interface CombinedSearchRouteState {
  q?: RouteValue;
  tab?: RouteValue;
  page?: RouteValue;
}

interface CombinedSearchLocation {
  readonly hash: string;
  readonly hostname: string;
  readonly pathname: string;
  readonly port: string;
  readonly protocol: string;
}

const firstString = (value: RouteValue): string | undefined => {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value === undefined ? undefined : String(value);
};

export const combinedSearchTab = (value: RouteValue): CombinedSearchTab => {
  const candidate = firstString(value);
  return candidate === "products" || candidate === "resources"
    ? candidate
    : "all";
};

export const combinedSearchRootIndex = (
  tab: CombinedSearchTab
): SearchIndexAlias => (tab === "resources" ? "resources" : "products");

const routePageToUiPage = (value: RouteValue): number | undefined => {
  const parsed = Number(firstString(value));
  return Number.isInteger(parsed) && parsed > 1 ? parsed : undefined;
};

export const createCombinedSearchStateMapping = (
  tab: CombinedSearchTab
): StateMapping<UiState, CombinedSearchRouteState> => ({
  routeToState: (routeState) => {
    const query = firstString(routeState.q)?.trim();
    const page = tab === "all" ? undefined : routePageToUiPage(routeState.page);
    const indexState: IndexUiState = {};
    if (query !== undefined && query.length > 0) {
      indexState.query = query;
    }
    if (page !== undefined) {
      indexState.page = page;
    }
    return { [combinedSearchRootIndex(tab)]: indexState };
  },
  stateToRoute: (uiState) => {
    const state = uiState[combinedSearchRootIndex(tab)] ?? {};
    const query = state.query?.trim();
    const routeState: CombinedSearchRouteState = {};
    if (query !== undefined && query.length > 0) {
      routeState.q = query;
    }
    if (tab !== "all") {
      routeState.tab = tab;
      if (state.page !== undefined && state.page > 1) {
        routeState.page = state.page;
      }
    }
    return routeState;
  },
});

export function createCombinedSearchUrl(
  location: CombinedSearchLocation,
  routeState: CombinedSearchRouteState
): string {
  const searchParams = new URLSearchParams();
  const query = firstString(routeState.q)?.trim();
  const tab = combinedSearchTab(routeState.tab);
  const page = firstString(routeState.page);
  if (query !== undefined && query.length > 0) {
    searchParams.set("q", query);
  }
  if (tab !== "all") {
    searchParams.set("tab", tab);
  }
  if (tab !== "all" && page !== undefined) {
    searchParams.set("page", page);
  }

  const queryString = searchParams.toString();
  const port = location.port === "" ? "" : `:${location.port}`;
  return `${location.protocol}//${location.hostname}${port}${location.pathname}${queryString === "" ? "" : `?${queryString}`}${location.hash}`;
}

export function parseCombinedSearchUrl(
  search: string
): CombinedSearchRouteState {
  const searchParams = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search
  );
  const routeState: CombinedSearchRouteState = {};
  const query = searchParams.get("q");
  const tab = searchParams.get("tab");
  const page = searchParams.get("page");
  if (query !== null) {
    routeState.q = query;
  }
  if (tab !== null) {
    routeState.tab = tab;
  }
  if (page !== null) {
    routeState.page = page;
  }
  return routeState;
}

export const combinedSearchPageHref = (
  query: string,
  tab: CombinedSearchTab,
  page: number
): string => {
  const searchParams = new URLSearchParams();
  const normalizedQuery = query.trim();
  if (normalizedQuery.length > 0) {
    searchParams.set("q", normalizedQuery);
  }
  if (tab !== "all") {
    searchParams.set("tab", tab);
  }
  if (tab !== "all" && Number.isInteger(page) && page > 1) {
    searchParams.set("page", String(page));
  }
  const queryString = searchParams.toString();
  return queryString === "" ? "?" : `?${queryString}`;
};

export const combinedSearchTabHref = (
  query: string,
  tab: CombinedSearchTab
): string => combinedSearchPageHref(query, tab, 1);
