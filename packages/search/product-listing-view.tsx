import { Button } from "@repo/design-system/components/ui/button";
import { Checkbox } from "@repo/design-system/components/ui/checkbox";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarInset,
  SidebarProvider,
} from "@repo/design-system/components/ui/sidebar";
import { useTranslations } from "@repo/i18n";
import type { Locale } from "@repo/i18n";
import {
  Configure,
  RangeInput,
  useHits,
  useInstantSearch,
  useRefinementList,
  useSearchBox,
  useSortBy,
  useStats,
} from "react-instantsearch";

import { humanizeSearchValue } from "./presentation";
import { SearchProductCard } from "./product-card";
import type { ProductSearchHit } from "./product-contract";
import type { ProductRefinementFacet } from "./product-discovery";
import {
  PRODUCT_LISTING_CONFIGURE,
  PRODUCT_LISTING_FACETS,
  PRODUCT_LISTING_SORT_ITEMS,
  productListingRefinementListOptions,
} from "./product-listing-config";
import { SearchPagination } from "./search-pagination";
import { SearchQuery } from "./search-query";

export interface ProductListingViewProps {
  readonly locale: Locale;
}

interface FacetListProps {
  readonly attribute: ProductRefinementFacet["id"];
}

function FacetList({ attribute }: FacetListProps) {
  const t = useTranslations("web.search.productListing");
  const { canToggleShowMore, isShowingMore, items, refine, toggleShowMore } =
    useRefinementList({
      attribute,
      ...productListingRefinementListOptions(attribute),
    });

  return (
    <div>
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
      {canToggleShowMore ? (
        <Button
          className="mt-3 h-8 px-0"
          onClick={toggleShowMore}
          size="sm"
          type="button"
          variant="link"
        >
          {isShowingMore ? t("showLess") : t("showMore")}
        </Button>
      ) : null}
    </div>
  );
}

function ProductFilters() {
  const t = useTranslations("web.search.productListing.facets");

  return (
    <aside aria-label="Product filters" className="w-full shrink-0 lg:w-64">
      <Sidebar
        className="h-auto w-full rounded-xl border border-sidebar-border bg-sidebar p-2 text-sidebar-foreground"
        collapsible="none"
      >
        <SidebarContent className="gap-6 overflow-visible">
          {PRODUCT_LISTING_FACETS.map((facet) => (
            <SidebarGroup key={facet.id}>
              <fieldset>
                <SidebarGroupLabel
                  asChild
                  className="mb-3 h-auto px-0 font-semibold text-base text-foreground"
                >
                  <legend>{t(facet.id)}</legend>
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  {facet.control === "refinement-list" ? (
                    <FacetList attribute={facet.id} />
                  ) : (
                    <RangeInput
                      attribute={facet.id}
                      classNames={{
                        form: "grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2",
                        input:
                          "h-9 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
                        label: "min-w-0",
                        separator: "text-muted-foreground",
                        submit:
                          "col-span-3 h-9 w-full rounded-md bg-primary px-3 font-medium text-primary-foreground text-sm shadow-xs hover:bg-primary/90",
                      }}
                      translations={{
                        separatorElementText: "to",
                        submitButtonText: "Apply",
                      }}
                    />
                  )}
                </SidebarGroupContent>
              </fieldset>
            </SidebarGroup>
          ))}
        </SidebarContent>
      </Sidebar>
    </aside>
  );
}

function ProductQuery() {
  const { query, refine } = useSearchBox();

  return (
    <div className="flex-1">
      <SearchQuery label="Search products" query={query} refine={refine} />
    </div>
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
      <SearchPagination label="Product listing pagination" />
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
      <SidebarProvider className="min-h-0 flex-col items-start gap-8 bg-transparent lg:flex-row">
        <ProductFilters />
        <SidebarInset className="min-w-0 bg-transparent">
          <ProductResults locale={locale} />
        </SidebarInset>
      </SidebarProvider>
    </>
  );
}
