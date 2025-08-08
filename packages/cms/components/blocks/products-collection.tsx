import { type FragmentOf, graphql, readFragment } from '@repo/cms/graphql';
import type { CommercetoolsCategoryField } from '@repo/cms/types';
import { default as CommerceProductsCollection } from '@repo/commerce/lib/product/components/products-collection';

export const ProductCardsFragment = graphql(`
    fragment ProductCards on ProductCards {
      title
      category
    }
`);

export function ProductsCollection(props: {
  data: FragmentOf<typeof ProductCardsFragment>;
}) {
  const data = readFragment(ProductCardsFragment, props.data);
  const title = data.title || '';
  const category = (data.category as CommercetoolsCategoryField).data[0];
  return <CommerceProductsCollection title={title} categoryId={category.id} />;
}

ProductsCollection.fragment = ProductCardsFragment;
