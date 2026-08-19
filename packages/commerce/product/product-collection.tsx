import { NextCommerce } from "@repo/commerce/runtime";
import {
  ProductCollection as ProductCollectionView,
  ProductGrid,
} from "@repo/design-system/components/commerce/blocks/product-collection";
import type { Locale } from "@repo/i18n/types";
import { Effect, Schema } from "effect";
import type { ReactNode } from "react";

import type { CategoryId, ProductId } from "./identity";
import { toProductCardPresentation } from "./presentation";
import { ListProductCardsInput, ProductDiscovery } from "./product-discovery";

interface ProductCollectionProps {
  readonly categoryId?: CategoryId;
  readonly description?: ReactNode;
  readonly excludeProductId?: ProductId;
  readonly limit?: number;
  readonly locale: Locale;
  readonly title: string;
}

type ProductCollectionGridProps = Omit<
  ProductCollectionProps,
  "description" | "title"
>;

const productCollectionArchitecture = {
  component: "server",
  description:
    "Uses connection() and the buyer-specific Commerce request Layer, so it executes at request time behind Suspense.",
  layer: "orchestration",
  layerLabel: "Commerce orchestration",
  name: "DynamicProductCatalog",
  rendering: "streamed",
  source: "commerce",
  sourceLabel: "Commerce provider",
} as const;

async function getProductCards({
  categoryId,
  excludeProductId,
  limit = 3,
  locale,
}: ProductCollectionGridProps) {
  const input = Schema.decodeUnknownSync(ListProductCardsInput)({
    ...(categoryId === undefined ? {} : { categoryId }),
    limit,
    ...(excludeProductId === undefined ? {} : { excludeProductId }),
  });
  const products = await NextCommerce.runPromise(
    Effect.flatMap(ProductDiscovery, (discovery) =>
      discovery.listCards(input)
    ).pipe(NextCommerce.provide(locale))
  );

  return products.map(toProductCardPresentation);
}

export async function ProductCollectionGrid(props: ProductCollectionGridProps) {
  const products = await getProductCards(props);

  if (products.length === 0) {
    return null;
  }

  return (
    <ProductGrid
      architecture={productCollectionArchitecture}
      products={products}
    />
  );
}

export async function ProductCollection({
  description,
  title,
  ...gridProps
}: ProductCollectionProps) {
  const products = await getProductCards(gridProps);

  if (products.length === 0) {
    return null;
  }

  return (
    <ProductCollectionView
      architecture={productCollectionArchitecture}
      title={title}
      description={description}
      products={products}
    />
  );
}
