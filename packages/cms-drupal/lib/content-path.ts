import { locales } from "@repo/i18n/config";
import { z } from "zod";

const LOCALE_PREFIX = /^\/(?<locale>[^/?#]+)(?=[/?#]|$)/u;
const applicationPath = z.string().regex(/^\/(?!\/)/u);

/** Drupal URLs carry their locale; Content paths leave localization to the UI. */
export function toContentPath(path: string): string {
  let relativePath = path;
  if (!path.startsWith("/")) {
    const url = new URL(path);
    relativePath = `${url.pathname}${url.search}${url.hash}`;
  }
  const unprefixedPath = applicationPath
    .parse(relativePath)
    .replace(LOCALE_PREFIX, (prefix, locale: string) =>
      locales.some((configuredLocale) => configuredLocale === locale)
        ? ""
        : prefix
    );

  return applicationPath.parse(
    unprefixedPath.startsWith("/") ? unprefixedPath : `/${unprefixedPath}`
  );
}
