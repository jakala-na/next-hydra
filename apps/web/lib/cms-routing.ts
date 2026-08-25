const SURROUNDING_SLASHES = /^\/+|\/+$/g;
const NEXT_DYNAMIC_ROUTE_PLACEHOLDER = /^%%drp:url:[0-9a-f]*%%$/;

function toCmsHomepagePath(homepageSlug: string): string {
  const normalizedSlug = homepageSlug.trim().replace(SURROUNDING_SLASHES, "");

  return normalizedSlug ? `/${normalizedSlug}` : "/";
}

export function resolveCmsPagePath(
  url: string | readonly string[] | undefined,
  homepageSlug: string
): string {
  const requestedPath = typeof url === "string" ? url : url?.join("/");

  return requestedPath && !NEXT_DYNAMIC_ROUTE_PLACEHOLDER.test(requestedPath)
    ? requestedPath
    : toCmsHomepagePath(homepageSlug);
}
