import { ArchitectureBoundary } from "@repo/design-system/components/architecture/architecture-boundary";
import { hasLocale, setRequestLocale } from "@repo/i18n";
import type { Locale } from "@repo/i18n";
import { routing } from "@repo/i18n/routing";
import { CombinedSearch } from "@repo/search/combined-search";
import type { CombinedSearchRouteState } from "@repo/search/combined-search-routing";
import { combinedSearchTab } from "@repo/search/combined-search-routing";
import { getCombinedSearchServerState } from "@repo/search/combined-search-server";
import { CombinedSearchSkeleton } from "@repo/search/combined-search-skeleton";
import type { SearchAudience } from "@repo/search/contract";
import { notFound, unstable_rethrow } from "next/navigation";
import { Suspense } from "react";

import {
  cachedSearchProvider,
  resolveProductSearchAudience,
} from "@/lib/product-search";

type CombinedSearchParams = PageProps<"/[locale]/search">["searchParams"];

const combinedSearchRouteState = (
  searchParams: Awaited<CombinedSearchParams>
): CombinedSearchRouteState => {
  const routeState: CombinedSearchRouteState = {};
  const keys = ["page", "q", "tab"] as const;
  for (const key of keys) {
    const value = searchParams[key];
    if (value !== undefined) {
      routeState[key] = value;
    }
  }
  return routeState;
};

const combinedSearchAudience = async (
  locale: Locale,
  tab: ReturnType<typeof combinedSearchTab>
): Promise<SearchAudience> =>
  tab === "resources" ? { locale } : await resolveProductSearchAudience(locale);

async function CombinedSearchResults({
  locale,
  searchParams,
}: {
  readonly locale: Locale;
  readonly searchParams: CombinedSearchParams;
}) {
  const routeState = combinedSearchRouteState(await searchParams);
  const tab = combinedSearchTab(routeState.tab);
  let serverState:
    | Awaited<ReturnType<typeof getCombinedSearchServerState>>
    | undefined;

  try {
    serverState = await getCombinedSearchServerState({
      audience: await combinedSearchAudience(locale, tab),
      provider: cachedSearchProvider,
      routeState,
      tab,
    });
  } catch (error) {
    unstable_rethrow(error);
    // oxlint-disable-next-line no-console -- Search SSR failure falls back to the browser proxy and must remain observable server-side.
    console.error("Combined server search failed", { error });
  }

  return (
    <CombinedSearch
      endpoint={`/api/search/${locale}`}
      key={`combined-search:${JSON.stringify(routeState)}`}
      locale={locale}
      serverState={serverState}
      tab={tab}
    />
  );
}

export default async function SearchPage({
  params,
  searchParams,
}: PageProps<"/[locale]/search">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  // oxlint-disable-next-line typescript/no-deprecated -- Match the repository's current next-intl static-rendering contract until its root-params migration lands.
  setRequestLocale(locale);

  return (
    <ArchitectureBoundary
      component="server"
      description="Streams provider-neutral Product and Resource search results into a shared InstantSearch experience."
      layer="route"
      layerLabel="App Router combined search shell"
      name="SearchRoute"
      rendering="streamed"
      source="app"
      sourceLabel="Next.js application"
    >
      <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
        <div className="mb-10 max-w-3xl">
          <p className="mb-2 font-medium text-muted-foreground text-sm uppercase tracking-wide">
            Search
          </p>
          <h1 className="font-semibold text-4xl tracking-tight">
            Products and Resources
          </h1>
          <p className="mt-3 text-base text-muted-foreground">
            Find products and useful content in one place.
          </p>
        </div>
        <Suspense fallback={<CombinedSearchSkeleton />}>
          <CombinedSearchResults locale={locale} searchParams={searchParams} />
        </Suspense>
      </div>
    </ArchitectureBoundary>
  );
}
