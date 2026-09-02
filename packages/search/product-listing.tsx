"use client";

import type { Locale } from "@repo/i18n";
import { history } from "instantsearch.js/es/lib/routers";
import { useMemo, useSyncExternalStore } from "react";
import { InstantSearchSSRProvider } from "react-instantsearch";
import type { InstantSearchServerState } from "react-instantsearch";

import { createProxySearchClient } from "./client";
import { ProductListingRoot } from "./product-listing-root";
import {
  createProductListingUrl,
  parseProductListingUrl,
  productListingStateMapping,
} from "./product-listing-routing";
import type { ProductListingRouteState } from "./product-listing-routing";
import { ProductListingSkeleton } from "./product-listing-skeleton";

export interface ProductListingProps {
  readonly endpoint: string;
  readonly locale: Locale;
  readonly serverState?: InstantSearchServerState;
}

export function ProductListing({
  endpoint,
  locale,
  serverState,
}: ProductListingProps) {
  const isMounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false
  );
  const client = useMemo(() => createProxySearchClient(endpoint), [endpoint]);
  const router = useMemo(
    () =>
      history<ProductListingRouteState>({
        cleanUrlOnDispose: false,
        createURL: ({ location, routeState }) =>
          createProductListingUrl(location, routeState),
        parseURL: ({ location }) => parseProductListingUrl(location.search),
      }),
    []
  );

  if (serverState === undefined && !isMounted) {
    return <ProductListingSkeleton />;
  }

  return (
    <InstantSearchSSRProvider {...serverState}>
      <ProductListingRoot
        locale={locale}
        routing={{
          router,
          stateMapping: productListingStateMapping,
        }}
        searchClient={client}
      />
    </InstantSearchSSRProvider>
  );
}
