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
  const title = heading ?? "";
  const descriptionJson = description?.json;
  const categoryId = decodeCommerceCategoryId(productCategory);

  if (Option.isNone(categoryId)) {
    return null;
  }

  return (
    <ArchitectureBoundary
      name="Product collection block"
      description="Uses Contentstack settings to select the product collection."
      composition="cms"
    >
      <ProductCollectionLayout
        description={renderRichText(descriptionJson)}
        title={title}
      >
        <ArchitectureBoundary name="Product collection" streaming>
          <Suspense fallback={<ProductCatalogSkeleton />}>
            <ProductCollectionGrid
              categoryId={categoryId.value}
              locale={locale}
            />
          </Suspense>
        </ArchitectureBoundary>
      </ProductCollectionLayout>
    </ArchitectureBoundary>
  );
}

DynamicProductCollection.fragment = dynamicProductCollectionFragment;

export const ProductCollectionBlock = graphql(
  `
    fragment ProductCollectionBlock on LandingPageComponents @_unmask {
      ... on LandingPageComponentsDynamicProductCollection {
        dynamic_product_collection {
          __typename
          ...DynamicProductCollection
        }
      }
    }
  `,
  [dynamicProductCollectionFragment]
);
