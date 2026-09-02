import type { IndexUiState, StateMapping, UiState } from "instantsearch.js";

import type { ProductIndexAlias } from "./contract";

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

export interface ProductListingRouteState {
  q?: RouteValue;
  category?: RouteValue;
  availability?: RouteValue;
  price?: RouteValue;
  page?: RouteValue;
  sort?: RouteValue;
}

interface ProductListingLocation {
  readonly hash: string;
  readonly hostname: string;
  readonly pathname: string;
  readonly port: string;
  readonly protocol: string;
}

const PRODUCT_LISTING_ROUTE_KEYS = [
  "q",
  "category",
  "availability",
  "price",
  "page",
  "sort",
] as const satisfies readonly (keyof ProductListingRouteState)[];

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
    const categories = allStrings(routeState.category);
    const availability = allStrings(routeState.availability);
    const price = firstString(routeState.price);
    const page = positivePage(routeState.page);
    const sortBy = sortIndex(routeState.sort);
    const products: IndexUiState = {};

    if (query !== undefined && query.length > 0) {
      products.query = query;
    }
    if (categories.length > 0 || availability.length > 0) {
      products.refinementList = {};
      if (categories.length > 0) {
        products.refinementList.category = categories;
      }
      if (availability.length > 0) {
        products.refinementList.availability = availability;
      }
    }
    if (price !== undefined && price.length > 0) {
      products.range = { price };
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
    const category = routeValue(state.refinementList?.category);
    const availability = routeValue(state.refinementList?.availability);
    const price = state.range?.price;
    const page =
      state.page !== undefined && state.page > 1 ? state.page : undefined;
    const sort = sortRoute(state.sortBy);
    const routeState: ProductListingRouteState = {};

    if (query !== undefined && query.length > 0) {
      routeState.q = query;
    }
    if (category !== undefined) {
      routeState.category = category;
    }
    if (availability !== undefined) {
      routeState.availability = availability;
    }
    if (price !== undefined && price.length > 0) {
      routeState.price = price;
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
