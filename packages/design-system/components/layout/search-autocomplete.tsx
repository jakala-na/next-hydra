"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import { Search, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

// Sample product data - in a real app, this would come from an API
const products = [
  {
    id: 1,
    name: "TX-500 Excavator",
    category: "Excavators",
    price: 285_000,
    image: "/heavy-industrial-excavator-machinery-on-constructi.jpg",
    slug: "tx-500-excavator",
  },
  {
    id: 2,
    name: "TX-750 Excavator",
    category: "Excavators",
    price: 425_000,
    image: "/heavy-industrial-excavator-machinery-on-constructi.jpg",
    slug: "tx-750-excavator",
  },
  {
    id: 3,
    name: "BL-400 Bulldozer",
    category: "Bulldozers",
    price: 350_000,
    image: "/heavy-industrial-excavator-machinery-on-constructi.jpg",
    slug: "bl-400-bulldozer",
  },
  {
    id: 4,
    name: "BL-600 Bulldozer",
    category: "Bulldozers",
    price: 485_000,
    image: "/heavy-industrial-excavator-machinery-on-constructi.jpg",
    slug: "bl-600-bulldozer",
  },
  {
    id: 5,
    name: "CR-300 Crane",
    category: "Cranes",
    price: 520_000,
    image: "/heavy-industrial-excavator-machinery-on-constructi.jpg",
    slug: "cr-300-crane",
  },
  {
    id: 6,
    name: "LD-250 Loader",
    category: "Loaders",
    price: 195_000,
    image: "/heavy-industrial-excavator-machinery-on-constructi.jpg",
    slug: "ld-250-loader",
  },
  {
    id: 7,
    name: "DT-40 Dump Truck",
    category: "Dump Trucks",
    price: 275_000,
    image: "/heavy-industrial-excavator-machinery-on-constructi.jpg",
    slug: "dt-40-dump-truck",
  },
  {
    id: 8,
    name: "GR-200 Grader",
    category: "Graders",
    price: 310_000,
    image: "/heavy-industrial-excavator-machinery-on-constructi.jpg",
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
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleClear = () => {
    setQuery("");
    setResults([]);
    setIsOpen(false);
  };

  return (
    <div ref={searchRef} className="relative w-full max-w-md">
      <div className="relative">
        <Search className="-translate-y-1/2 absolute top-1/2 left-3 h-4 w-4 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search products..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => query.length > 0 && setIsOpen(true)}
          className="bg-muted/50 pr-9 pl-9"
        />
        {query && (
          <Button
            variant="ghost"
            size="icon"
            className="-translate-y-1/2 absolute top-1/2 right-1 h-7 w-7"
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
                href={`/products/${product.slug}`}
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
              href={`/products?q=${encodeURIComponent(query)}`}
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
