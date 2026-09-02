import { ArchitectureBoundary } from "@repo/design-system/components/architecture/architecture-boundary";
import { hasLocale, setRequestLocale } from "@repo/i18n";
import type { Locale } from "@repo/i18n";
import { routing } from "@repo/i18n/routing";
import { ProductListing } from "@repo/search/product-listing";
import type { ProductListingRouteState } from "@repo/search/product-listing-routing";
import { getProductListingServerState } from "@repo/search/product-listing-server";
import { ProductListingSkeleton } from "@repo/search/product-listing-skeleton";
import { notFound, unstable_rethrow } from "next/navigation";
import { Suspense } from "react";

import {
  cachedProductSearchProvider,
  resolveProductSearchAudience,
} from "@/lib/product-search";

type ProductListingSearchParams =
  PageProps<"/[locale]/products">["searchParams"];

const productListingRouteState = (
  searchParams: Awaited<ProductListingSearchParams>
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
}: {
  readonly locale: Locale;
  readonly searchParams: ProductListingSearchParams;
}) {
  const routeState = productListingRouteState(await searchParams);
  let serverState:
    | Awaited<ReturnType<typeof getProductListingServerState>>
    | undefined;
  try {
    const audience = await resolveProductSearchAudience(locale);
    serverState = await getProductListingServerState({
      audience,
      provider: cachedProductSearchProvider,
      routeState,
    });
  } catch (error) {
    unstable_rethrow(error);
    // oxlint-disable-next-line no-console -- Product listing SSR failure falls back to the browser proxy and must remain observable server-side.
    console.error("Product listing server search failed", { error });
  }

  return (
    <ProductListing
      endpoint={`/api/search/${locale}`}
      locale={locale}
      serverState={serverState}
    />
  );
}

export default async function ProductsPage({
  params,
  searchParams,
}: PageProps<"/[locale]/products">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  // oxlint-disable-next-line typescript/no-deprecated -- Match the repository's current next-intl static-rendering contract until its root-params migration lands.
  setRequestLocale(locale);

  return (
    <ArchitectureBoundary
      component="server"
      description="Prerenders the Product listing shell while audience-aware InstantSearch results stream at request time."
      layer="route"
      layerLabel="App Router Product listing shell"
      name="ProductsRoute"
      rendering="streamed"
      source="app"
      sourceLabel="Next.js application"
    >
      <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
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
