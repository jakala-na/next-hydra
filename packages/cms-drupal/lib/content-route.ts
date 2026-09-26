import type { Locale } from "@repo/i18n";
import { getPathname } from "@repo/i18n/navigation";
import type { Route } from "next";

import { toContentPath } from "./content-path";

export function toContentRoute(path: string, locale: Locale): Route {
  const href = toContentPath(path);
  // SAFETY: The CMS boundary validates an application-relative path. The app's
  // catch-all accepts it, but Next cannot infer next-intl's runtime route string.
  return getPathname({ href, locale }) as Route;
}
