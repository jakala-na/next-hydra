const SURROUNDING_SLASHES = /^\/+|\/+$/g;

function toCmsHomepagePath(homepageSlug: string): string {
  const normalizedSlug = homepageSlug.trim().replace(SURROUNDING_SLASHES, "");

  return normalizedSlug ? `/${normalizedSlug}` : "/";
}

export function resolveCmsPagePath(
  url: string | readonly string[] | undefined,
  homepageSlug: string
): string {
  const requestedPath = typeof url === "string" ? url : url?.join("/");

  return requestedPath || toCmsHomepagePath(homepageSlug);
}
