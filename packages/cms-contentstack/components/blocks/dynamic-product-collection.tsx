import { ProductCollection as CommerceProductCollection } from "@repo/commerce/product/product-collection";
import { ArchitectureBoundary } from "@repo/design-system/components/architecture/architecture-boundary";
import { ProductCatalogSkeleton } from "@repo/design-system/components/commerce/blocks/product-collection";
import type { Locale } from "@repo/i18n";
import { Option } from "effect";
import { Suspense } from "react";
import { type FragmentOf, graphql, readFragment } from "../../graphql";
import { decodeCommerceCategoryId } from "../../lib/commerce-category";
import { renderRichText } from "../../lib/utils/rich-text-utils";
import type { ComponentBaseProps } from "../../types";

export const dynamicProductCollectionFragment = graphql(`
    fragment DynamicProductCollection on DynamicProductCollection {
      heading
      description {
        json
      }
      product_category
    }
`);

export function DynamicProductCollection(
  props: {
    data: FragmentOf<typeof dynamicProductCollectionFragment>;
    locale: Locale;
  } & ComponentBaseProps
) {
  const { data: fragment, locale } = props;
  const data = readFragment(dynamicProductCollectionFragment, fragment);
  const { description, heading, product_category: productCategory } = data;
  const title = heading || "";
  const categoryId = decodeCommerceCategoryId(productCategory);

  if (Option.isNone(categoryId)) {
    return null;
  }

  return (
    <ArchitectureBoundary
      cacheProfile="inherits CMS route cache"
      component="server"
      description="Maps a Contentstack modular block into the stable Commerce catalog contract."
      layer="block"
      layerLabel="CMS block adapter"
      name="ProductCatalogBlock"
      rendering="cached"
      source="cms"
      sourceLabel="Contentstack CMS"
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
            <ProductCatalogSkeleton title={title} />
          </ArchitectureBoundary>
        }
      >
        <CommerceProductCollection
          title={title}
          categoryId={categoryId.value}
          description={
            description?.json ? renderRichText(description?.json) : undefined
          }
          locale={locale}
        />
      </Suspense>
    </ArchitectureBoundary>
  );
}

DynamicProductCollection.fragment = dynamicProductCollectionFragment;
