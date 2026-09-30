"use client";

import type { Locale } from "@repo/i18n";
import { history } from "instantsearch.js/es/lib/routers";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { InstantSearchSSRProvider } from "react-instantsearch";
import type { InstantSearchServerState } from "react-instantsearch";

import { createProxySearchClient } from "./client";
import { CombinedSearchRoot } from "./combined-search-root";
import type {
  CombinedSearchRouteState,
  CombinedSearchTab,
} from "./combined-search-routing";
import {
  createCombinedSearchStateMapping,
  createCombinedSearchUrl,
  parseCombinedSearchUrl,
} from "./combined-search-routing";
import { CombinedSearchSkeleton } from "./combined-search-skeleton";
import { getInstantSearchLocation } from "./instant-search-history";

export interface CombinedSearchProps {
  readonly endpoint: string;
  readonly locale: Locale;
  readonly serverUrl: string;
  readonly serverState?: InstantSearchServerState;
  readonly tab: CombinedSearchTab;
}

export function CombinedSearch({
  endpoint,
  locale,
  serverUrl,
  serverState,
  tab,
}: CombinedSearchProps) {
  const isMounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false
  );
  const client = useMemo(() => createProxySearchClient(endpoint), [endpoint]);
  const router = useMemo(
    () =>
      history<CombinedSearchRouteState>({
        cleanUrlOnDispose: false,
        createURL: ({ location, routeState }) =>
          createCombinedSearchUrl(location, routeState),
        getLocation: () => getInstantSearchLocation(serverUrl),
        parseURL: ({ location }) => parseCombinedSearchUrl(location.search),
      }),
    [serverUrl]
  );
  const stateMapping = useMemo(
    () => createCombinedSearchStateMapping(tab),
    [tab]
  );

  useEffect(() => {
    router.start?.();
    return () => {
      router.dispose();
    };
  }, [router]);

  if (serverState === undefined && !isMounted) {
    return <CombinedSearchSkeleton />;
  }

  return (
    <InstantSearchSSRProvider {...serverState}>
      <CombinedSearchRoot
        key={tab}
        locale={locale}
        routing={{ router, stateMapping }}
        searchClient={client}
        tab={tab}
      />
    </InstantSearchSSRProvider>
  );
}
