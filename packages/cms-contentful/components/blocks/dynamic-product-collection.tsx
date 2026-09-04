import { ProductCollectionGrid } from "@repo/commerce/product/product-collection";
import { ArchitectureBoundary } from "@repo/design-system/components/architecture/architecture-boundary";
import {
  ProductCatalogSkeleton,
  ProductCollectionLayout,
} from "@repo/design-system/components/commerce/blocks/product-collection";
import type { Locale } from "@repo/i18n";
import { Option } from "effect";
import { Suspense } from "react";

import type { ContentfulDynamicProductCollection } from "../../content";
import { decodeCommerceCategoryId } from "../../lib/commerce-category";

type DynamicProductCollectionProps = {
  readonly data: ContentfulDynamicProductCollection;
  readonly locale: Locale;
};

export function DynamicProductCollection({
  data,
  locale,
}: DynamicProductCollectionProps) {
  const categoryId = decodeCommerceCategoryId(data.productCategory);
  if (Option.isNone(categoryId)) {
    return null;
  }

  return (
    <ArchitectureBoundary
      cacheProfile="inherits CMS route cache"
      component="server"
      description="Maps a Contentful entry into the stable Commerce catalog contract."
      layer="block"
      layerLabel="CMS block adapter"
      name="ProductCatalogBlock"
      rendering="cached"
      source="cms"
      sourceLabel="Contentful CMS"
    >
      <ProductCollectionLayout
        description={data.description ?? undefined}
        title={data.heading ?? ""}
      >
        <Suspense
          fallback={
            <ArchitectureBoundary
              component="server"
              description="The cached CMS shell is visible while buyer-aware Commerce data streams."
              layer="orchestration"
              layerLabel="Suspense stream fallback"
              name="DynamicProductCatalog (pending)"
              rendering="streamed"
              source="commerce"
              sourceLabel="Commerce provider"
            >
              <ProductCatalogSkeleton />
            </ArchitectureBoundary>
          }
        >
          <ProductCollectionGrid
            categoryId={categoryId.value}
            locale={locale}
          />
        </Suspense>
      </ProductCollectionLayout>
    </ArchitectureBoundary>
  );
}
