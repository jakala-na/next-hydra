"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import { Search, X } from "lucide-react";
import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

// Sample product data - in a real app, this would come from an API
const products = [
  {
    category: "Excavators",
    id: 1,
    image: "/heavy-industrial-excavator-machinery-on-constructi.jpg",
    name: "TX-500 Excavator",
    price: 285_000,
    slug: "tx-500-excavator",
  },
  {
    category: "Excavators",
    id: 2,
    image: "/heavy-industrial-excavator-machinery-on-constructi.jpg",
    name: "TX-750 Excavator",
    price: 425_000,
    slug: "tx-750-excavator",
  },
  {
    category: "Bulldozers",
    id: 3,
    image: "/heavy-industrial-excavator-machinery-on-constructi.jpg",
    name: "BL-400 Bulldozer",
    price: 350_000,
    slug: "bl-400-bulldozer",
  },
  {
    category: "Bulldozers",
    id: 4,
    image: "/heavy-industrial-excavator-machinery-on-constructi.jpg",
    name: "BL-600 Bulldozer",
    price: 485_000,
    slug: "bl-600-bulldozer",
  },
  {
    category: "Cranes",
    id: 5,
    image: "/heavy-industrial-excavator-machinery-on-constructi.jpg",
    name: "CR-300 Crane",
    price: 520_000,
    slug: "cr-300-crane",
  },
  {
    category: "Loaders",
    id: 6,
    image: "/heavy-industrial-excavator-machinery-on-constructi.jpg",
    name: "LD-250 Loader",
    price: 195_000,
    slug: "ld-250-loader",
  },
  {
    category: "Dump Trucks",
    id: 7,
    image: "/heavy-industrial-excavator-machinery-on-constructi.jpg",
    name: "DT-40 Dump Truck",
    price: 275_000,
    slug: "dt-40-dump-truck",
  },
  {
    category: "Graders",
    id: 8,
    image: "/heavy-industrial-excavator-machinery-on-constructi.jpg",
    name: "GR-200 Grader",
    price: 310_000,
    slug: "gr-200-grader",
  },
];

export function SearchAutocomplete() {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [results, setResults] = useState<typeof products>([]);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (query.length > 0) {
      const filtered = products.filter(
        (product) =>
          product.name.toLowerCase().includes(query.toLowerCase()) ||
          product.category.toLowerCase().includes(query.toLowerCase())
      );
      setResults(filtered);
      setIsOpen(true);
    } else {
      setResults([]);
      setIsOpen(false);
    }
  }, [query]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        searchRef.current &&
        !searchRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleClear = () => {
    setQuery("");
    setResults([]);
    setIsOpen(false);
  };

  return (
    <div ref={searchRef} className="relative w-full max-w-md">
      <div className="relative">
        <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search products..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
          }}
          onFocus={() => query.length > 0 && setIsOpen(true)}
          className="bg-muted/50 pr-9 pl-9"
        />
        {query && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-1/2 right-1 h-7 w-7 -translate-y-1/2"
            onClick={handleClear}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {isOpen && results.length > 0 && (
        <div className="absolute top-full z-50 mt-2 w-full overflow-hidden rounded-lg border bg-background shadow-lg">
          <div className="p-2">
            <p className="px-2 py-1 text-muted-foreground text-xs">
              {results.length} {results.length === 1 ? "result" : "results"}{" "}
              found
            </p>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {results.map((product) => (
              <Link
                key={product.id}
                href={`/products/${product.slug}` as Route}
                onClick={() => {
                  setIsOpen(false);
                  setQuery("");
                }}
                className="flex items-center gap-3 p-3 transition-colors hover:bg-muted/50"
              >
                <div className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded bg-muted">
                  <Image
                    src={product.image || "/placeholder.svg"}
                    alt={product.name}
                    fill
                    className="object-cover"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-sm">{product.name}</p>
                  <p className="text-muted-foreground text-xs">
                    {product.category}
                  </p>
                </div>
                <div className="font-semibold text-primary text-sm">
                  ${product.price.toLocaleString()}
                </div>
              </Link>
            ))}
          </div>
          <div className="border-t p-2">
            <Link
              href={`/products?q=${encodeURIComponent(query)}` as Route}
              onClick={() => {
                setIsOpen(false);
                setQuery("");
              }}
              className="block py-2 text-center text-primary text-sm hover:underline"
            >
              View all results for "{query}"
            </Link>
          </div>
        </div>
      )}

      {isOpen && query.length > 0 && results.length === 0 && (
        <div className="absolute top-full z-50 mt-2 w-full rounded-lg border bg-background p-6 text-center shadow-lg">
          <p className="text-muted-foreground text-sm">
            No products found for "{query}"
          </p>
          <p className="mt-1 text-muted-foreground text-xs">
            Try a different search term
          </p>
        </div>
      )}
    </div>
  );
}
