"use client";

import type { NavigationItem } from "@repo/design-system/components/layout/navigation";
import { Input } from "@repo/design-system/components/ui/input";
import { Search } from "lucide-react";
import { useId, useState } from "react";

export function NavigationSearch({
  navigationItems,
}: {
  readonly navigationItems: readonly NavigationItem[];
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const resultsId = useId();
  const entries = navigationItems.flatMap((item) => [
    ...(item.href ? [{ href: item.href, title: item.title }] : []),
    ...(item.children ?? []),
  ]);
  const term = query.trim().toLocaleLowerCase();
  const results = entries.filter((item) =>
    item.title.toLocaleLowerCase().includes(term)
  );
  return (
    <div
      className="relative w-full max-w-md"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
        }
      }}
    >
      <Search
        aria-hidden="true"
        className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        aria-label="Search navigation"
        aria-controls={open && term ? resultsId : undefined}
        type="search"
        placeholder="Search…"
        className="pl-9"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {open && term && (
        <ul
          id={resultsId}
          className="absolute top-full z-50 mt-2 w-full rounded-lg border bg-background p-2 shadow-lg"
        >
          {results.length === 0 && (
            <li className="p-2 text-sm">No matching pages</li>
          )}
          {results.map((item) => (
            <li key={`${item.href}-${item.title}`}>
              <a
                className="block rounded p-2 text-sm hover:bg-muted"
                href={item.href}
                onClick={() => {
                  setOpen(false);
                }}
              >
                {item.title}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
