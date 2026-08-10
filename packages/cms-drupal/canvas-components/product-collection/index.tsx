import { decodeCommerceCategoryId } from "@repo/cms-drupal/lib/commerce-category";
import { ProductCollectionGrid } from "@repo/commerce/product/product-collection";
import { ArchitectureBoundary } from "@repo/design-system/components/architecture/architecture-boundary";
import {
  ProductCatalogSkeleton,
  ProductCollectionLayout,
} from "@repo/design-system/components/commerce/blocks/product-collection";
import { getLocale } from "@repo/i18n";
import { Option } from "effect";
import { Suspense } from "react";

type CanvasProductCollectionProps = {
  categoryId?: string;
  description?: string;
  limit?: 3 | 6 | 9;
  title: string;
};

type ProductCollectionContentProps = Pick<
  Parameters<typeof ProductCollectionGrid>[0],
  "categoryId" | "limit"
>;

async function ProductCollectionContent({
  categoryId,
  limit,
}: ProductCollectionContentProps) {
  return (
    <ProductCollectionGrid
      categoryId={categoryId}
      limit={limit}
      locale={await getLocale()}
    />
  );
}

export default function CanvasProductCollection(
  props: CanvasProductCollectionProps
) {
  const categoryId = decodeCommerceCategoryId(props.categoryId);
  if (Option.isNone(categoryId)) {
    return null;
  }

  return (
    <ArchitectureBoundary
      component="server"
      description="Maps Canvas-authored collection settings into the stable Commerce catalog contract."
      layer="block"
      layerLabel="Canvas component adapter"
      name="CanvasProductCollection"
      rendering="dynamic"
      source="cms"
      sourceLabel="Drupal Canvas"
    >
      <ProductCollectionLayout
        description={props.description}
        title={props.title}
      >
        <Suspense fallback={<ProductCatalogSkeleton />}>
          <ProductCollectionContent
            categoryId={categoryId.value}
            limit={props.limit}
          />
        </Suspense>
      </ProductCollectionLayout>
    </ArchitectureBoundary>
  );
}
