import { type FragmentOf, graphql, readFragment } from "@repo/cms/graphql";
import { decodeCommerceCategoryId } from "@repo/cms/lib/commerce-category";
import { renderRichText } from "@repo/cms/lib/utils/rich-text-utils";
import type { ComponentBaseProps } from "@repo/cms/types";
import { ProductCollection as CommerceProductCollection } from "@repo/commerce/product/product-collection";
import type { Locale } from "@repo/i18n";
import { Option } from "effect";

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
  const locale = props.locale;
  const data = readFragment(dynamicProductCollectionFragment, props.data);
  const title = data.heading || "";
  const description = data.description;
  const categoryId = decodeCommerceCategoryId(data.product_category);

  if (Option.isNone(categoryId)) {
    return null;
  }

  return (
    <CommerceProductCollection
      title={title}
      categoryId={categoryId.value}
      description={
        description?.json ? renderRichText(description?.json) : undefined
      }
      locale={locale}
    />
  );
}

DynamicProductCollection.fragment = dynamicProductCollectionFragment;
