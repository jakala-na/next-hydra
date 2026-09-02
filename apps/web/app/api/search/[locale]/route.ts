import { hasLocale } from "@repo/i18n";
import { routing } from "@repo/i18n/routing";
import { makeSearchRouteHandler } from "@repo/search/server";

import {
  cachedProductSearchProvider,
  resolveProductSearchAudience,
} from "@/lib/product-search";

export async function POST(
  request: Request,
  { params }: RouteContext<"/api/search/[locale]">
): Promise<Response> {
  // oxlint-disable-next-line typescript/no-unsafe-assignment -- RouteContext params are generated and validated by Next typegen before this route is compiled.
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    return Response.json(
      { error: { code: "INVALID_LOCALE" } },
      { status: 404 }
    );
  }

  return await makeSearchRouteHandler({
    provider: cachedProductSearchProvider,
    resolveAudience: async () => await resolveProductSearchAudience(locale),
  })(request);
}
