import { Button } from "@repo/design-system/components/ui/button";
import { Checkbox } from "@repo/design-system/components/ui/checkbox";
import type { Locale } from "@repo/i18n";
import {
  Configure,
  RangeInput,
  useHits,
  useInstantSearch,
  usePagination,
  useRefinementList,
  useSearchBox,
  useSortBy,
  useStats,
} from "react-instantsearch";

import type { ProductSearchHit } from "./contract";
import { humanizeSearchValue } from "./presentation";
import { SearchProductCard } from "./product-card";
import {
  PRODUCT_LISTING_CONFIGURE,
  PRODUCT_LISTING_FACETS,
  PRODUCT_LISTING_RANGE_ATTRIBUTE,
  PRODUCT_LISTING_REFINEMENT_LIST,
  PRODUCT_LISTING_SORT_ITEMS,
} from "./product-listing-config";

export interface ProductListingViewProps {
  readonly locale: Locale;
}

interface FacetListProps {
  readonly attribute: "availability" | "category";
}

function FacetList({ attribute }: FacetListProps) {
  const { items, refine } = useRefinementList({
    attribute,
    ...PRODUCT_LISTING_REFINEMENT_LIST,
  });

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const id = `${attribute}-${item.value}`;
        return (
          <div className="flex items-center gap-2" key={item.value}>
            <Checkbox
              checked={item.isRefined}
              id={id}
              onCheckedChange={() => {
                refine(item.value);
              }}
            />
            <label
              className="flex min-w-0 flex-1 cursor-pointer items-center justify-between gap-3 text-sm"
              htmlFor={id}
            >
              <span>{humanizeSearchValue(item.label)}</span>
              <span className="text-muted-foreground tabular-nums">
                {item.count}
              </span>
            </label>
          </div>
        );
      })}
    </div>
  );
}

function ProductFilters() {
  return (
    <aside
      aria-label="Product filters"
      className="space-y-8 border-border border-b pb-8 lg:border-r lg:border-b-0 lg:pr-8 lg:pb-0"
    >
      {PRODUCT_LISTING_FACETS.map(({ attribute, label }) => (
        <fieldset key={attribute}>
          <legend className="mb-4 font-semibold text-base">{label}</legend>
          <FacetList attribute={attribute} />
        </fieldset>
      ))}
      <fieldset>
        <legend className="mb-4 font-semibold text-base">Price</legend>
        <RangeInput
          attribute={PRODUCT_LISTING_RANGE_ATTRIBUTE}
          classNames={{
            form: "flex items-center gap-2",
            input:
              "h-9 min-w-0 flex-1 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
            separator: "text-muted-foreground",
            submit:
              "h-9 rounded-md bg-primary px-3 font-medium text-primary-foreground text-sm shadow-xs hover:bg-primary/90",
          }}
          translations={{
            separatorElementText: "to",
            submitButtonText: "Apply",
          }}
        />
      </fieldset>
    </aside>
  );
}

function ProductQuery() {
  const { query, refine } = useSearchBox();

  return (
    <label className="block flex-1">
      <span className="sr-only">Search products</span>
      <input
        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        onChange={(event) => {
          refine(event.currentTarget.value);
        }}
        placeholder="Search products"
        type="search"
        value={query}
      />
    </label>
  );
}

function ProductSort() {
  const { currentRefinement, options, refine } = useSortBy({
    items: PRODUCT_LISTING_SORT_ITEMS,
  });

  return (
    <label className="flex shrink-0 items-center gap-2 text-sm">
      <span>Sort by</span>
      <select
        aria-label="Sort products"
        className="h-10 rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        onChange={(event) => {
          refine(event.currentTarget.value);
        }}
        value={currentRefinement}
      >
        {options.map(({ label, value }) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ProductPagination() {
  const { currentRefinement, isFirstPage, isLastPage, nbPages, refine } =
    usePagination();

  if (nbPages <= 1) {
    return null;
  }

  return (
    <nav
      aria-label="Product listing pagination"
      className="mt-10 flex items-center justify-center gap-3"
    >
      <Button
        disabled={isFirstPage}
        onClick={() => {
          refine(currentRefinement - 1);
        }}
        type="button"
        variant="outline"
      >
        Previous
      </Button>
      <span className="text-muted-foreground text-sm">
        Page {currentRefinement + 1} of {nbPages}
      </span>
      <Button
        disabled={isLastPage}
        onClick={() => {
          refine(currentRefinement + 1);
        }}
        type="button"
        variant="outline"
      >
        Next
      </Button>
    </nav>
  );
}

function ProductResults({ locale }: { readonly locale: Locale }) {
  const { status } = useInstantSearch({ catchError: true });
  const { items } = useHits<ProductSearchHit>();
  const { nbHits } = useStats();

  if (status === "error") {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-6">
        <h2 className="font-semibold">Product search is unavailable</h2>
        <p className="mt-1 text-muted-foreground text-sm">
          Please try again shortly.
        </p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-10 text-center">
        <h2 className="font-semibold text-lg">
          {status === "loading" || status === "stalled"
            ? "Loading products…"
            : "No products found"}
        </h2>
        <p className="mt-2 text-muted-foreground text-sm">
          Try changing or clearing a filter.
        </p>
      </div>
    );
  }

  return (
    <>
      <p aria-live="polite" className="mb-5 text-muted-foreground text-sm">
        {nbHits.toLocaleString(locale)} {nbHits === 1 ? "product" : "products"}
      </p>
      <div className="grid gap-8 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((hit) => (
          <div data-search-hit={hit.objectID} key={hit.objectID}>
            <SearchProductCard hit={hit} locale={locale} />
          </div>
        ))}
      </div>
      <ProductPagination />
    </>
  );
}

export function ProductListingView({ locale }: ProductListingViewProps) {
  return (
    <>
      <Configure {...PRODUCT_LISTING_CONFIGURE} />
      <div className="mb-8 flex flex-col gap-4 border-b pb-8 sm:flex-row">
        <ProductQuery />
        <ProductSort />
      </div>
      <div className="grid gap-8 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <ProductFilters />
        <main>
          <ProductResults locale={locale} />
        </main>
      </div>
    </>
  );
}
