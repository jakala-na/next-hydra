import { ProductCollectionGrid } from "@repo/commerce/product/product-collection";
import { ArchitectureBoundary } from "@repo/design-system/components/architecture/architecture-boundary";
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
      cacheProfile="inherits CMS route cache"
      component="server"
      description="Maps a Drupal Paragraph into the stable Commerce catalog contract."
      layer="block"
      layerLabel="CMS block adapter"
      name="ProductCatalogBlock"
      rendering="cached"
      source="cms"
      sourceLabel="Drupal CMS"
    >
      <ProductCollectionLayout
        description={data.productDescription ?? undefined}
        title={data.productHeading ?? ""}
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
            locale={props.locale}
          />
        </Suspense>
      </ProductCollectionLayout>
    </ArchitectureBoundary>
  );
}

DynamicProductCollection.fragment = dynamicProductCollectionFragment;
