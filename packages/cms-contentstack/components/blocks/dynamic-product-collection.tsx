import { ProductCollection as CommerceProductCollection } from "@repo/commerce/product/product-collection";
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
    <Suspense fallback={null}>
      <CommerceProductCollection
        title={title}
        categoryId={categoryId.value}
        description={
          description?.json ? renderRichText(description?.json) : undefined
        }
        locale={locale}
      />
    </Suspense>
  );
}

DynamicProductCollection.fragment = dynamicProductCollectionFragment;
