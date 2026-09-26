import { toProductCardPresentation } from "@repo/commerce/product";
import { ArchitectureBoundary } from "@repo/design-system/components/architecture/architecture-boundary";
import ProductCard from "@repo/design-system/components/commerce/product-card";
import type { ProductCardProps } from "@repo/design-system/components/commerce/product-card";
import type { Locale } from "@repo/i18n";
import type { ReactElement } from "react";

import type { ProductSearchHit } from "./product-contract";
import { decodeProductSearchHit } from "./product-contract";
import type { SearchHit } from "./search-collection";

interface SearchProductCardProps {
  readonly headingLevel?: ProductCardProps["headingLevel"];
  readonly hit: ProductSearchHit;
  readonly locale: Locale;
}

function toProductCardProps(
  hit: ProductSearchHit,
  headingLevel: ProductCardProps["headingLevel"],
  locale: Locale
): ProductCardProps {
  const product = toProductCardPresentation(hit.productCard);
  return {
    ...product,
    badge: hit.productCard.availableForSale ? "In stock" : "Out of stock",
    category: hit.categories[0]?.label ?? "Product",
    headingLevel,
    productHref: { pathname: `/${locale}/product/${hit.productCard.slug}` },
  };
}

export function SearchProductCard({
  headingLevel = "h2",
  hit,
  locale,
}: SearchProductCardProps): ReactElement {
  return (
    <ArchitectureBoundary
      component="client"
      description="Presents the canonical commerce Product Card carried by a provider-normalized Product search hit."
      layer="presentation"
      layerLabel="Search hit presentation adapter"
      name="SearchProductCard"
      rendering="streamed"
      source="search"
      sourceLabel="Search provider"
    >
      <ProductCard {...toProductCardProps(hit, headingLevel, locale)} />
    </ArchitectureBoundary>
  );
}

export type { SearchProductCardProps };

export const ProductResultCard = ({
  hit,
  locale,
}: {
  readonly hit: SearchHit;
  readonly locale: Locale;
}) => (
  <SearchProductCard
    hit={decodeProductSearchHit(hit)}
    locale={locale}
    headingLevel="h3"
  />
);
