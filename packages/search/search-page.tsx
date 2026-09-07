import "server-only";
import { ArchitectureBoundary } from "@repo/design-system/components/architecture/architecture-boundary";
import type { Locale } from "@repo/i18n";
import { searchRuntime } from "@repo/search/runtime";
import { unstable_rethrow } from "next/navigation";
import { Suspense } from "react";

import { CombinedSearch } from "./combined-search";
import type { CombinedSearchRouteState } from "./combined-search-routing";
import {
  combinedSearchTab,
  createCombinedSearchUrl,
} from "./combined-search-routing";
import { getCombinedSearchServerState } from "./combined-search-server";
import { CombinedSearchSkeleton } from "./combined-search-skeleton";
import type { SearchAudience } from "./contract";
import { createServerSearchLocation } from "./instant-search-history";

type SearchParamValue = string | string[] | undefined;

export interface SearchPageProps {
  readonly locale: Locale;
  readonly searchParams: Promise<Record<string, SearchParamValue>>;
}

const combinedSearchRouteState = (
  searchParams: Record<string, SearchParamValue>
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
  tab === "resources"
    ? { locale }
    : await searchRuntime.resolveProductAudience(locale);

async function CombinedSearchResults({
  locale,
  searchParams,
}: SearchPageProps) {
  const { autocompleteRoutes, endpoint } =
    searchRuntime.getClientConfiguration(locale);
  const routeState = combinedSearchRouteState(await searchParams);
  const tab = combinedSearchTab(routeState.tab);
  const serverUrl = createCombinedSearchUrl(
    createServerSearchLocation(autocompleteRoutes.searchPath),
    routeState
  );
  let serverState:
    | Awaited<ReturnType<typeof getCombinedSearchServerState>>
    | undefined;

  try {
    serverState = await getCombinedSearchServerState({
      audience: await combinedSearchAudience(locale, tab),
      provider: searchRuntime,
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
      endpoint={endpoint}
      key={`combined-search:${JSON.stringify(routeState)}`}
      locale={locale}
      serverUrl={serverUrl}
      serverState={serverState}
      tab={tab}
    />
  );
}

export function SearchPage({ locale, searchParams }: SearchPageProps) {
  return (
    <ArchitectureBoundary
      component="server"
      description="Streams provider-neutral Product and Resource search results into a shared InstantSearch experience."
      layer="route"
      layerLabel="Search results page"
      name="SearchPage"
      rendering="streamed"
      source="search"
      sourceLabel="Search package"
    >
      <div className="container py-10 lg:py-14">
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
