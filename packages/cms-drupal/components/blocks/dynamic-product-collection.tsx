import { ProductCollection } from "@repo/commerce/product/product-collection";
import type { Locale } from "@repo/i18n";
import { Option } from "effect";
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
    <ProductCollection
      categoryId={categoryId.value}
      description={data.productDescription ?? undefined}
      locale={props.locale}
      title={data.productHeading ?? ""}
    />
  );
}

DynamicProductCollection.fragment = dynamicProductCollectionFragment;
