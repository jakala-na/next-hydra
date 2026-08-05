const SURROUNDING_SLASHES = /^\/+|\/+$/g;

function toCmsHomepagePath(homepageSlug: string): string {
  const normalizedSlug = homepageSlug.trim().replace(SURROUNDING_SLASHES, "");

  return normalizedSlug ? `/${normalizedSlug}` : "/";
}

export function resolveCmsPagePath(
  url: readonly string[] | undefined,
  homepageSlug: string
): string {
  return url?.length ? url.join("/") : toCmsHomepagePath(homepageSlug);
}
