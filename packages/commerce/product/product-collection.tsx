import { ProductCollection as ProductCollectionView } from "@repo/design-system/components/commerce/blocks/product-collection";
import type { Locale } from "@repo/i18n/types";
import { Effect, Schema } from "effect";
import type { ReactNode } from "react";
import { commerceRequestLayer } from "../commerce-context/request";
import type { CategoryId, ProductId } from "./identity";
import { toProductCardPresentation } from "./presentation";
import { ListProductCardsInput, ProductDiscovery } from "./product-discovery";

interface ProductCollectionProps {
  readonly title: string;
  readonly description?: ReactNode;
  readonly categoryId?: CategoryId;
  readonly limit?: number;
  readonly locale: Locale;
  readonly excludeProductId?: ProductId;
}

export async function ProductCollection({
  categoryId,
  description,
  excludeProductId,
  limit = 3,
  locale,
  title,
}: ProductCollectionProps) {
  const input = Schema.decodeUnknownSync(ListProductCardsInput)({
    ...(categoryId === undefined ? {} : { categoryId }),
    limit,
    ...(excludeProductId === undefined ? {} : { excludeProductId }),
  });
  const layer = await commerceRequestLayer(locale);
  const products = await Effect.runPromise(
    Effect.flatMap(ProductDiscovery, (discovery) =>
      discovery.listCards(input)
    ).pipe(Effect.provide(layer))
  );

  if (products.length === 0) {
    return null;
  }

  return (
    <ProductCollectionView
      title={title}
      description={description}
      products={products.map(toProductCardPresentation)}
    />
  );
}
