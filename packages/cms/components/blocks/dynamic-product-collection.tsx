import { type FragmentOf, graphql, readFragment } from "@repo/cms/graphql";
import { renderRichText } from "@repo/cms/lib/utils/rich-text-utils";
import type {
  CommercetoolsCategoryField,
  ComponentBaseProps,
} from "@repo/cms/types";
import { ProductCollection as CommerceProductCollection } from "@repo/commerce/components/blocks/product-collection";
import type { Locale } from "@repo/i18n";

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
  const category = (data.product_category as CommercetoolsCategoryField)
    ?.data[0];

  return (
    <CommerceProductCollection
      title={title}
      categoryId={category?.id}
      description={
        description?.json ? renderRichText(description?.json) : undefined
      }
      locale={locale}
    />
  );
}

DynamicProductCollection.fragment = dynamicProductCollectionFragment;
