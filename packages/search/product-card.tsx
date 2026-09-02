import { toProductCardPresentation } from "@repo/commerce/product";
import { ArchitectureBoundary } from "@repo/design-system/components/architecture/architecture-boundary";
import ProductCard from "@repo/design-system/components/commerce/product-card";
import type { ProductCardProps } from "@repo/design-system/components/commerce/product-card";
import type { Locale } from "@repo/i18n";
import type { ReactElement } from "react";

import type { ProductSearchHit } from "./contract";

interface SearchProductCardProps {
  readonly hit: ProductSearchHit;
  readonly locale: Locale;
}

function toProductCardProps(
  hit: ProductSearchHit,
  locale: Locale
): ProductCardProps {
  const product = toProductCardPresentation(hit.productCard);
  return {
    ...product,
    badge: hit.productCard.availableForSale ? "In stock" : "Out of stock",
    category: hit.categories[0]?.label ?? "Product",
    headingLevel: "h2",
    productHref: { pathname: `/${locale}/product/${hit.productCard.slug}` },
  };
}

export function SearchProductCard({
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
      <ProductCard {...toProductCardProps(hit, locale)} />
    </ArchitectureBoundary>
  );
}

export type { SearchProductCardProps };
