import "server-only";
import type { Locale } from "@repo/i18n";
import { searchRuntime } from "@repo/search/runtime";

import { createSearchRouteHandler } from "./server";

export const handleSearchRequest = async (
  request: Request,
  locale: Locale
): Promise<Response> =>
  await createSearchRouteHandler({
    provider: searchRuntime,
    resolveAudience: async (batch) =>
      await searchRuntime.resolveAudience(locale, batch),
  })(request);
