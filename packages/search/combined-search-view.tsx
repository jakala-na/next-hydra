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

import { searchCards } from "./cards";
import { searchCollections } from "./collections";
import { combinedSearchConfigure } from "./combined-search-config";
import {
  COMBINED_SEARCH_TABS,
  combinedSearchRootIndex,
  combinedSearchTabHref,
} from "./combined-search-routing";
import type { CombinedSearchTab } from "./combined-search-routing";
import type { SearchCollection, SearchHit } from "./search-collection";
import { SearchPagination } from "./search-pagination";
import { SearchQuery } from "./search-query";

export interface CombinedSearchViewProps {
  readonly locale: Locale;
  readonly tab: CombinedSearchTab;
}

// SAFETY: Search routing returns only encoded query parameters on the current page.
const searchRoute = (href: string): Route => href as Route;

function CollectionResults({
  collection,
  locale,
  preview,
  query,
}: {
  readonly collection: SearchCollection;
  readonly locale: Locale;
  readonly preview: boolean;
  readonly query: string;
}) {
  const { status } = useInstantSearch({ catchError: true });
  const { items } = useHits<SearchHit>();
  const { nbHits } = useStats();
  const { label } = collection;
  const cards: Readonly<
    Record<string, (typeof searchCards)[keyof typeof searchCards]>
  > = searchCards;
  const Card = cards[collection.indexName];
  if (Card === undefined) {
    throw new Error(`No result card configured for ${collection.indexName}`);
  }
  if (status === "error") {
    return (
      <div
        className="rounded-lg border border-destructive/40 bg-destructive/5 p-6"
        role="alert"
      >
        <h2 className="font-semibold">Search is unavailable</h2>
        <p className="mt-1 text-muted-foreground text-sm">
          Please try again shortly.
        </p>
      </div>
    );
  }
  return (
    <section aria-labelledby={`${collection.indexName}-search-results`}>
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h2
            className="font-semibold text-2xl"
            id={`${collection.indexName}-search-results`}
          >
            {label}
          </h2>
          <p className="mt-1 text-muted-foreground text-sm">
            {nbHits.toLocaleString(locale)}{" "}
            {nbHits === 1 ? "result" : "results"}
          </p>
        </div>
        {preview && nbHits > items.length ? (
          <Button asChild variant="outline">
            <Link
              href={searchRoute(combinedSearchTabHref(query, collection.id))}
            >
              Show more {label}
            </Link>
          </Button>
        ) : null}
      </div>
      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="font-semibold">
            {status === "loading" || status === "stalled"
              ? `Loading ${label}…`
              : `No ${label} found`}
          </p>
        </div>
      ) : (
        <div
          className={
            collection.layout === "grid"
              ? "grid gap-8 md:grid-cols-2 lg:grid-cols-3"
              : "space-y-5"
          }
        >
          {items.map((hit) => (
            <div
              data-search-result-type={collection.resultType}
              key={hit.objectID}
            >
              <Card hit={hit} locale={locale} />
            </div>
          ))}
        </div>
      )}
      {preview ? null : <SearchPagination label={collection.paginationLabel} />}
    </section>
  );
}

export function CombinedSearchView({ locale, tab }: CombinedSearchViewProps) {
  const { query, refine } = useSearchBox();
  const rootIndex = combinedSearchRootIndex(tab);
  const preview = tab === "all" && searchCollections.length > 1;
  const selected =
    tab === "all"
      ? searchCollections
      : searchCollections.filter(({ id }) => id === tab);
  return (
    <>
      <Configure {...combinedSearchConfigure(rootIndex, tab)} />
      <div className="space-y-6">
        <SearchQuery label="Search" query={query} refine={refine} />
        {searchCollections.length > 1 ? (
          <div
            aria-label="Search result types"
            className="border-b"
            role="tablist"
          >
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
                  {candidate === "all"
                    ? "All"
                    : searchCollections.find(({ id }) => id === candidate)
                        ?.label}
                </Link>
              ))}
            </div>
          </div>
        ) : null}
      </div>
      <div className="mt-8 space-y-12">
        {selected.map((collection) =>
          collection.indexName === rootIndex ? (
            <CollectionResults
              collection={collection}
              key={collection.id}
              locale={locale}
              preview={preview}
              query={query}
            />
          ) : (
            <Index indexName={collection.indexName} key={collection.id}>
              <Configure
                {...combinedSearchConfigure(collection.indexName, tab)}
              />
              <CollectionResults
                collection={collection}
                locale={locale}
                preview={preview}
                query={query}
              />
            </Index>
          )
        )}
      </div>
    </>
  );
}
