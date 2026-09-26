import type { IndexUiState, StateMapping, UiState } from "instantsearch.js";

import type { ProductIndexAlias } from "./product-contract";
import { PRODUCT_DISCOVERY } from "./product-discovery";
import type { ProductFacetRoute } from "./product-discovery";

export const PRODUCT_SORTS = [
  { label: "Relevance", route: undefined, value: "products" },
  {
    label: "Price: Low to High",
    route: "price-asc",
    value: "products@price-asc",
  },
  {
    label: "Price: High to Low",
    route: "price-desc",
    value: "products@price-desc",
  },
] as const satisfies readonly {
  readonly label: string;
  readonly route: ProductSortRoute | undefined;
  readonly value: ProductIndexAlias;
}[];

export type ProductSortRoute = "price-asc" | "price-desc";
type RouteValue = string | number | string[] | undefined;

type ProductListingRouteKey = ProductFacetRoute | "page" | "q" | "sort";

export type ProductListingRouteState = Partial<
  Record<ProductListingRouteKey, RouteValue>
>;

interface ProductListingLocation {
  readonly hash: string;
  readonly hostname: string;
  readonly pathname: string;
  readonly port: string;
  readonly protocol: string;
}

const PRODUCT_LISTING_ROUTE_KEYS: readonly ProductListingRouteKey[] = [
  "q",
  ...PRODUCT_DISCOVERY.facets.map(({ route }) => route),
  "page",
  "sort",
];

/** Serializes array refinements as repeated keys instead of provider-shaped brackets. */
export function createProductListingUrl(
  location: ProductListingLocation,
  routeState: ProductListingRouteState
): string {
  const searchParams = new URLSearchParams();

  for (const key of PRODUCT_LISTING_ROUTE_KEYS) {
    const value = routeState[key];
    const items: (number | string)[] = [];
    if (Array.isArray(value)) {
      items.push(...value);
    } else if (value !== undefined) {
      items.push(value);
    }
    for (const item of items) {
      searchParams.append(key, String(item));
    }
  }

  const query = searchParams.toString();
  const port = location.port === "" ? "" : `:${location.port}`;
  return `${location.protocol}//${location.hostname}${port}${location.pathname}${query === "" ? "" : `?${query}`}${location.hash}`;
}

/** Parses the public URL format shared by the server route and browser router. */
export function parseProductListingUrl(
  search: string
): ProductListingRouteState {
  const searchParams = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search
  );
  const routeState: ProductListingRouteState = {};

  for (const key of PRODUCT_LISTING_ROUTE_KEYS) {
    const values = searchParams.getAll(key);
    if (values.length > 0) {
      routeState[key] = values.length === 1 ? values[0] : values;
    }
  }

  // oxlint-disable-next-line anti-slop/no-known-value-widening -- The known route keys are generated from Product discovery above.
  return routeState;
}

function firstString(value: RouteValue): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value === undefined ? undefined : String(value);
}

function allStrings(value: RouteValue): string[] {
  if (Array.isArray(value)) {
    return [...value];
  }
  return value === undefined ? [] : [String(value)];
}

function routeValue(values: string[] | undefined): RouteValue {
  if (values === undefined || values.length === 0) {
    return undefined;
  }
  return values.length === 1 ? values[0] : values;
}

function sortRoute(
  indexName: string | undefined
): ProductSortRoute | undefined {
  return PRODUCT_SORTS.find(({ value }) => value === indexName)?.route;
}

function sortIndex(route: RouteValue): ProductIndexAlias | undefined {
  const normalized = firstString(route);
  if (normalized === undefined) {
    return undefined;
  }
  return PRODUCT_SORTS.find(({ route: candidate }) => candidate === normalized)
    ?.value;
}

function positivePage(value: RouteValue): number | undefined {
  const parsed = Number(firstString(value));
  return Number.isInteger(parsed) && parsed > 1 ? parsed : undefined;
}

/**
 * Keeps provider/index details out of shareable storefront URLs while retaining
 * the InstantSearch UI state needed to restore the Product listing.
 */
export const productListingStateMapping: StateMapping<
  UiState,
  ProductListingRouteState
> = {
  routeToState: (routeState) => {
    const query = firstString(routeState.q)?.trim();
    const page = positivePage(routeState.page);
    const sortBy = sortIndex(routeState.sort);
    const products: IndexUiState = {};
    const refinementList: Record<string, string[]> = {};
    const range: Record<string, string> = {};

    if (query !== undefined && query.length > 0) {
      products.query = query;
    }
    for (const facet of PRODUCT_DISCOVERY.facets) {
      if (facet.control === "refinement-list") {
        const values = allStrings(routeState[facet.route]);
        if (values.length > 0) {
          refinementList[facet.id] = values;
        }
      } else {
        const value = firstString(routeState[facet.route]);
        if (value !== undefined && value.length > 0) {
          range[facet.id] = value;
        }
      }
    }
    if (Object.keys(refinementList).length > 0) {
      products.refinementList = refinementList;
    }
    if (Object.keys(range).length > 0) {
      products.range = range;
    }
    if (page !== undefined) {
      products.page = page;
    }
    if (sortBy !== undefined) {
      products.sortBy = sortBy;
    }

    return { products };
  },
  stateToRoute: (uiState) => {
    const state = uiState.products ?? {};
    const query = state.query?.trim();
    const page =
      state.page !== undefined && state.page > 1 ? state.page : undefined;
    const sort = sortRoute(state.sortBy);
    const routeState: ProductListingRouteState = {};

    if (query !== undefined && query.length > 0) {
      routeState.q = query;
    }
    for (const facet of PRODUCT_DISCOVERY.facets) {
      const value =
        facet.control === "refinement-list"
          ? routeValue(state.refinementList?.[facet.id])
          : state.range?.[facet.id];
      if (value !== undefined && (!Array.isArray(value) || value.length > 0)) {
        routeState[facet.route] = value;
      }
    }
    if (page !== undefined) {
      routeState.page = page;
    }
    if (sort !== undefined) {
      routeState.sort = sort;
    }

    return routeState;
  },
};
