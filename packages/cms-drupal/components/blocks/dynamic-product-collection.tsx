import { ProductCollectionGrid } from "@repo/commerce/product/product-collection";
import { ArchitectureBoundary } from "@repo/demo-architecture/boundary";
import {
  ProductCatalogSkeleton,
  ProductCollectionLayout,
} from "@repo/design-system/components/commerce/blocks/product-collection";
import type { Locale } from "@repo/i18n";
import { Option } from "effect";
import { Suspense } from "react";

import { graphql, readFragment } from "../../graphql";
import type { FragmentOf } from "../../graphql";
import { decodeCommerceCategoryId } from "../../lib/commerce-category";

export const dynamicProductCollectionFragment = graphql(`
  fragment DrupalDynamicProductCollection on ParagraphDynamicProductCollection {
    productHeading: heading
    productDescription: description
    productCategory
  }
`);

type DynamicProductCollectionProps = {
  data: FragmentOf<typeof dynamicProductCollectionFragment>;
  locale: Locale;
};

export function DynamicProductCollection(props: DynamicProductCollectionProps) {
  const data = readFragment(dynamicProductCollectionFragment, props.data);
  const categoryId = decodeCommerceCategoryId(data.productCategory);

  if (Option.isNone(categoryId)) {
    return null;
  }

  return (
    <ArchitectureBoundary
      name="Product collection block"
      description="Uses Drupal paragraph settings to select the product collection."
      composition="cms"
    >
      <ProductCollectionLayout
        description={data.productDescription ?? undefined}
        title={data.productHeading ?? ""}
      >
        <ArchitectureBoundary name="Product collection" streaming>
          <Suspense fallback={<ProductCatalogSkeleton />}>
            <ProductCollectionGrid
              categoryId={categoryId.value}
              locale={props.locale}
            />
          </Suspense>
        </ArchitectureBoundary>
      </ProductCollectionLayout>
    </ArchitectureBoundary>
  );
}

DynamicProductCollection.fragment = dynamicProductCollectionFragment;

export const DrupalDynamicProductCollection = dynamicProductCollectionFragment;
export const ParagraphDynamicProductCollection = {
  Component: DynamicProductCollection,
  fragment: dynamicProductCollectionFragment,
  getCacheTags: (): string[] => [],
};
