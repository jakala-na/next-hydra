import { ProductCollection } from "@repo/commerce/product/product-collection";
import { ArchitectureBoundary } from "@repo/design-system/components/architecture/architecture-boundary";
import { ProductCatalogSkeleton } from "@repo/design-system/components/commerce/blocks/product-collection";
import type { Locale } from "@repo/i18n";
import { Option } from "effect";
import { Suspense } from "react";
import { type FragmentOf, graphql, readFragment } from "../../graphql";
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
            <ProductCatalogSkeleton title={data.productHeading ?? ""} />
          </ArchitectureBoundary>
        }
      >
        <ProductCollection
          categoryId={categoryId.value}
          description={data.productDescription ?? undefined}
          locale={props.locale}
          title={data.productHeading ?? ""}
        />
      </Suspense>
    </ArchitectureBoundary>
  );
}

DynamicProductCollection.fragment = dynamicProductCollectionFragment;
