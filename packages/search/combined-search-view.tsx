import { Button } from "@repo/design-system/components/ui/button";
import { cn } from "@repo/design-system/lib/utils";
import type { Locale } from "@repo/i18n";
import type { Route } from "next";
import Link from "next/link";
import {
  Configure,
  Index,
  useHits,
  useInstantSearch,
  useSearchBox,
  useStats,
} from "react-instantsearch";

import {
  combinedProductSearchConfigure,
  combinedContentSearchConfigure,
} from "./combined-search-config";
import type { CombinedSearchTab } from "./combined-search-routing";
import {
  COMBINED_SEARCH_TABS,
  combinedSearchTabHref,
} from "./combined-search-routing";
import type { ContentSearchHit, ProductSearchHit } from "./contract";
import { SearchProductCard } from "./product-card";
import { SearchResourceCard } from "./resource-card";
import { SearchPagination } from "./search-pagination";
import { SearchQuery } from "./search-query";

export interface CombinedSearchViewProps {
  readonly locale: Locale;
  readonly tab: CombinedSearchTab;
}

const tabLabel = (tab: CombinedSearchTab): string => {
  if (tab === "all") {
    return "All";
  }
  return tab === "products" ? "Products" : "Resources";
};

// SAFETY: Combined Search routing only returns query strings built from the
// allowlisted Search tab and numeric page state.
const searchRoute = (href: string): Route => href as Route;

function CombinedSearchTabs({
  query,
  tab,
}: {
  readonly query: string;
  readonly tab: CombinedSearchTab;
}) {
  return (
    <div aria-label="Search result types" className="border-b" role="tablist">
      <div className="flex gap-6">
        {COMBINED_SEARCH_TABS.map((candidate) => (
          <Link
            aria-selected={candidate === tab}
            className={cn(
              "border-b-2 px-1 py-4 font-medium text-sm transition-colors",
              candidate === tab
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
            href={searchRoute(combinedSearchTabHref(query, candidate))}
            key={candidate}
            role="tab"
          >
            {tabLabel(candidate)}
          </Link>
        ))}
      </div>
    </div>
  );
}

function SearchUnavailable() {
  return (
    <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-6">
      <h2 className="font-semibold">Search is unavailable</h2>
      <p className="mt-1 text-muted-foreground text-sm">
        Please try again shortly.
      </p>
    </div>
  );
}

function NoResults({ label }: { readonly label: string }) {
  const { status } = useInstantSearch({ catchError: true });
  return (
    <div className="rounded-lg border border-dashed p-8 text-center">
      <p className="font-semibold">
        {status === "loading" || status === "stalled"
          ? `Loading ${label}…`
          : `No ${label} found`}
      </p>
    </div>
  );
}

function ProductResults({
  locale,
  preview,
  query,
}: {
  readonly locale: Locale;
  readonly preview: boolean;
  readonly query: string;
}) {
  const { status } = useInstantSearch({ catchError: true });
  const { items } = useHits<ProductSearchHit>();
  const { nbHits } = useStats();

  if (status === "error") {
    return <SearchUnavailable />;
  }

  return (
    <section aria-labelledby="product-search-results">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h2 className="font-semibold text-2xl" id="product-search-results">
            Products
          </h2>
          <p className="mt-1 text-muted-foreground text-sm">
            {nbHits.toLocaleString(locale)}{" "}
            {nbHits === 1 ? "result" : "results"}
          </p>
        </div>
        {preview && nbHits > items.length ? (
          <Button asChild variant="outline">
            <Link href={searchRoute(combinedSearchTabHref(query, "products"))}>
              Show more Products
            </Link>
          </Button>
        ) : null}
      </div>
      {items.length === 0 ? (
        <NoResults label="Products" />
      ) : (
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {items.map((hit) => (
            <div data-search-result-type="product" key={hit.objectID}>
              <SearchProductCard headingLevel="h3" hit={hit} locale={locale} />
            </div>
          ))}
        </div>
      )}
      {preview ? null : <SearchPagination label="Product results pagination" />}
    </section>
  );
}

function ResourceResults({
  locale,
  preview,
  query,
}: {
  readonly locale: Locale;
  readonly preview: boolean;
  readonly query: string;
}) {
  const { status } = useInstantSearch({ catchError: true });
  const { items } = useHits<ContentSearchHit>();
  const { nbHits } = useStats();

  if (status === "error") {
    return <SearchUnavailable />;
  }

  return (
    <section aria-labelledby="resource-search-results">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h2 className="font-semibold text-2xl" id="resource-search-results">
            Resources
          </h2>
          <p className="mt-1 text-muted-foreground text-sm">
            {nbHits.toLocaleString(locale)}{" "}
            {nbHits === 1 ? "result" : "results"}
          </p>
        </div>
        {preview && nbHits > items.length ? (
          <Button asChild variant="outline">
            <Link href={searchRoute(combinedSearchTabHref(query, "resources"))}>
              Show more Resources
            </Link>
          </Button>
        ) : null}
      </div>
      {items.length === 0 ? (
        <NoResults label="Resources" />
      ) : (
        <div className="space-y-5">
          {items.map((hit) => (
            <div data-search-result-type="resource" key={hit.objectID}>
              <SearchResourceCard hit={hit} layout="row" locale={locale} />
            </div>
          ))}
        </div>
      )}
      {preview ? null : (
        <SearchPagination label="Resource results pagination" />
      )}
    </section>
  );
}

function AllSearchResults({
  locale,
  query,
}: {
  readonly locale: Locale;
  readonly query: string;
}) {
  return (
    <div className="space-y-12">
      <ProductResults locale={locale} preview query={query} />
      <Index indexName="content">
        <Configure {...combinedContentSearchConfigure("all")} />
        <ResourceResults locale={locale} preview query={query} />
      </Index>
    </div>
  );
}

export function CombinedSearchView({ locale, tab }: CombinedSearchViewProps) {
  const { query, refine } = useSearchBox();

  return (
    <>
      <Configure
        {...(tab === "resources"
          ? combinedContentSearchConfigure(tab)
          : combinedProductSearchConfigure(tab))}
      />
      <div className="space-y-6">
        <SearchQuery
          label="Search Products and Resources"
          query={query}
          refine={refine}
        />
        <CombinedSearchTabs query={query} tab={tab} />
      </div>
      <div className="mt-8">
        {tab === "all" ? (
          <AllSearchResults locale={locale} query={query} />
        ) : null}
        {tab === "products" ? (
          <ProductResults locale={locale} preview={false} query={query} />
        ) : null}
        {tab === "resources" ? (
          <ResourceResults locale={locale} preview={false} query={query} />
        ) : null}
      </div>
    </>
  );
}
