import { NextCommerce } from "@repo/commerce/runtime";
import {
  ProductCollection as ProductCollectionView,
  ProductGrid,
} from "@repo/design-system/components/commerce/blocks/product-collection";
import type { Locale } from "@repo/i18n/types";
import { Effect, Schema } from "effect";
import { connection } from "next/server";
import type { ReactNode } from "react";

import { CommerceContextObservation } from "../commerce-context/commerce-context-observation";
import { CommerceContext } from "../services/commerce-context";
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

const getProductCards = async ({
  categoryId,
  excludeProductId,
  limit = 3,
  locale,
}: ProductCollectionGridProps) => {
  await connection();

  let encodedInput: typeof ListProductCardsInput.Encoded = { limit };
  if (categoryId !== undefined) {
    encodedInput = { ...encodedInput, categoryId };
  }
  if (excludeProductId !== undefined) {
    encodedInput = { ...encodedInput, excludeProductId };
  }
  const input = Schema.decodeSync(ListProductCardsInput)(encodedInput);
  const { products, store } = await NextCommerce.runPromise(
    Effect.gen(function* () {
      const context = yield* CommerceContext;
      const discovery = yield* ProductDiscovery;
      const discoveredProducts = yield* discovery.listCards(input);

      return { products: discoveredProducts, store: context.store };
    }).pipe(NextCommerce.provide(locale))
  );

  return { products: products.map(toProductCardPresentation), store };
};

export const ProductCollectionGrid = async (
  props: ProductCollectionGridProps
) => {
  const { products, store } = await getProductCards(props);

  return (
    <>
      <CommerceContextObservation store={store} />
      {products.length === 0 ? null : (
        <ProductGrid
          architecture={productCollectionArchitecture}
          products={products}
        />
      )}
    </>
  );
};

export const ProductCollection = async ({
  description,
  title,
  ...gridProps
}: ProductCollectionProps) => {
  const { products, store } = await getProductCards(gridProps);

  return (
    <>
      <CommerceContextObservation store={store} />
      {products.length === 0 ? null : (
        <ProductCollectionView
          architecture={productCollectionArchitecture}
          title={title}
          description={description}
          products={products}
        />
      )}
    </>
  );
};
