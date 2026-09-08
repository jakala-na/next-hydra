import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@repo/design-system/components/ui/pagination";
import type { MouseEvent } from "react";
import { usePagination } from "react-instantsearch";

export function SearchPagination({ label }: { readonly label: string }) {
  const {
    createURL,
    currentRefinement,
    isFirstPage,
    isLastPage,
    nbPages,
    pages,
    refine,
  } = usePagination({ padding: 1 });

  if (nbPages <= 1) {
    return null;
  }

  const pageHref = (page: number): string => {
    // SSR uses a synthetic origin; keep pagination links on the current host.
    const { pathname, search, hash } = new URL(createURL(page));
    return `${pathname}${search}${hash}`;
  };

  const pageLinkProps = (page: number, disabled = false) => ({
    "aria-disabled": disabled || undefined,
    className: disabled ? "pointer-events-none opacity-50" : undefined,
    href: disabled ? undefined : pageHref(page),
    onClick: (event: MouseEvent<HTMLAnchorElement>) => {
      if (disabled) {
        event.preventDefault();
        return;
      }
      if (
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      // InstantSearch owns pagination and URL synchronization. A Next.js route
      // transition would race that state and reapply the previous SSR page.
      event.preventDefault();
      refine(page);
    },
    tabIndex: disabled ? -1 : undefined,
  });

  const pageLink = (page: number, className?: string) => (
    <PaginationItem className={className} key={page}>
      <PaginationLink
        {...pageLinkProps(page)}
        aria-label={`Go to page ${page + 1}`}
        isActive={page === currentRefinement}
      >
        {page + 1}
      </PaginationLink>
    </PaginationItem>
  );

  const firstPage = pages[0] ?? 0;
  const lastPage = pages.at(-1) ?? 0;

  return (
    <Pagination aria-label={label} className="mt-8">
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            {...pageLinkProps(currentRefinement - 1, isFirstPage)}
            aria-label="Previous"
          />
        </PaginationItem>
        {firstPage > 0 ? pageLink(0, "hidden sm:list-item") : null}
        {firstPage > 1 ? (
          <PaginationItem className="hidden sm:list-item">
            <PaginationEllipsis />
          </PaginationItem>
        ) : null}
        {pages.map((page) => pageLink(page))}
        {lastPage < nbPages - 2 ? (
          <PaginationItem className="hidden sm:list-item">
            <PaginationEllipsis />
          </PaginationItem>
        ) : null}
        {lastPage < nbPages - 1
          ? pageLink(nbPages - 1, "hidden sm:list-item")
          : null}
        <PaginationItem>
          <PaginationNext
            {...pageLinkProps(currentRefinement + 1, isLastPage)}
            aria-label="Next"
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}
