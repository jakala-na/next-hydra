import type { Route } from "next";

import type { ContentSearchHit } from "./contract";

export interface SearchAutocompleteRoutes {
  readonly productPathPrefix?: string;
  readonly contentPathPrefix: string;
  readonly searchPath: string;
}

export const appendSearchPath = (prefix: string, path: string): Route => {
  const normalizedPrefix = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  // SAFETY: The application supplies a localized route prefix and Search hit
  // paths are validated at their provider boundary.
  return `${normalizedPrefix}${normalizedPath}` as Route;
};

export const autocompleteContentHref = (
  hit: ContentSearchHit,
  routes: SearchAutocompleteRoutes
): Route => appendSearchPath(routes.contentPathPrefix, hit.contentCard.path);

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
