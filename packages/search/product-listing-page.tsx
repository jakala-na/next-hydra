import "server-only";
import { ArchitectureBoundary } from "@repo/design-system/components/architecture/architecture-boundary";
import type { Locale } from "@repo/i18n";
import { searchRuntime } from "@repo/search/runtime";
import { unstable_rethrow } from "next/navigation";
import { Suspense } from "react";

import { createServerSearchLocation } from "./instant-search-history";
import { ProductListing } from "./product-listing";
import type { ProductListingRouteState } from "./product-listing-routing";
import { createProductListingUrl } from "./product-listing-routing";
import { getProductListingServerState } from "./product-listing-server";
import { ProductListingSkeleton } from "./product-listing-skeleton";

type SearchParamValue = string | string[] | undefined;

export interface ProductListingPageProps {
  readonly locale: Locale;
  readonly searchParams: Promise<Record<string, SearchParamValue>>;
}

const productListingRouteState = (
  searchParams: Record<string, SearchParamValue>
): ProductListingRouteState => {
  const routeState: ProductListingRouteState = {};
  const keys = [
    "availability",
    "category",
    "page",
    "price",
    "q",
    "sort",
  ] as const;
  for (const key of keys) {
    const value = searchParams[key];
    if (value !== undefined) {
      routeState[key] = value;
    }
  }
  return routeState;
};

async function ProductListingResults({
  locale,
  searchParams,
}: ProductListingPageProps) {
  const { endpoint, productListingPath } =
    searchRuntime.getClientConfiguration(locale);
  const routeState = productListingRouteState(await searchParams);
  const serverUrl = createProductListingUrl(
    createServerSearchLocation(productListingPath),
    routeState
  );
  let serverState:
    | Awaited<ReturnType<typeof getProductListingServerState>>
    | undefined;
  try {
    const audience = await searchRuntime.resolveProductAudience(locale);
    serverState = await getProductListingServerState({
      audience,
      provider: searchRuntime,
      routeState,
    });
  } catch (error) {
    unstable_rethrow(error);
    // oxlint-disable-next-line no-console -- Product listing SSR failure falls back to the browser proxy and must remain observable server-side.
    console.error("Product listing server search failed", { error });
  }

  return (
    <ProductListing
      endpoint={endpoint}
      locale={locale}
      serverUrl={serverUrl}
      serverState={serverState}
    />
  );
}

export function ProductListingPage({
  locale,
  searchParams,
}: ProductListingPageProps) {
  return (
    <ArchitectureBoundary
      component="server"
      description="Prerenders the Product listing shell while audience-aware InstantSearch results stream at request time."
      layer="route"
      layerLabel="Search Product listing page"
      name="ProductListingPage"
      rendering="streamed"
      source="search"
      sourceLabel="Search package"
    >
      <div className="container py-10 lg:py-14">
        <div className="mb-10 max-w-3xl">
          <p className="mb-2 font-medium text-muted-foreground text-sm uppercase tracking-wide">
            Product catalog
          </p>
          <h1 className="font-semibold text-4xl tracking-tight">Products</h1>
          <p className="mt-3 text-muted-foreground text-base">
            Find products available for your current store and buying context.
          </p>
        </div>
        <Suspense fallback={<ProductListingSkeleton />}>
          <ProductListingResults locale={locale} searchParams={searchParams} />
        </Suspense>
      </div>
    </ArchitectureBoundary>
  );
}
