import type { Route } from "next";

import type { ProductSearchHit, ResourceSearchHit } from "./contract";

export interface SearchAutocompleteRoutes {
  readonly productPathPrefix: string;
  readonly resourcePathPrefix: string;
  readonly searchPath: string;
}

const appendPath = (prefix: string, path: string): Route => {
  const normalizedPrefix = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  // SAFETY: The application supplies a localized route prefix and Search hit
  // paths are validated at their provider boundary.
  return `${normalizedPrefix}${normalizedPath}` as Route;
};

export const autocompleteProductHref = (
  hit: ProductSearchHit,
  routes: SearchAutocompleteRoutes
): Route => appendPath(routes.productPathPrefix, hit.productCard.slug);

export const autocompleteResourceHref = (
  hit: ResourceSearchHit,
  routes: SearchAutocompleteRoutes
): Route => appendPath(routes.resourcePathPrefix, hit.resourceCard.path);

export const autocompleteSearchHref = (
  query: string,
  routes: SearchAutocompleteRoutes
): Route => {
  const searchParams = new URLSearchParams();
  const normalizedQuery = query.trim();
  if (normalizedQuery.length > 0) {
    searchParams.set("q", normalizedQuery);
  }
  const queryString = searchParams.toString();
  // SAFETY: The application supplied search path is already localized and
  // URLSearchParams encodes the only dynamic query value before it is appended.
  return queryString.length === 0
    ? (routes.searchPath as Route)
    : (`${routes.searchPath}?${queryString}` as Route);
};
