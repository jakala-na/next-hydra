import { type FragmentOf, graphql, readFragment } from '@repo/cms/graphql';
import type { CommercetoolsCategoryField } from '@repo/cms/types';
import { ProductsCollection as CommerceProductsCollection } from '@repo/commerce';

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

  return (
    <CommerceProductsCollection
      title={title}
      categoryId={category.id}
      // TODO: derive locale and currency from page context
      locale="en-US"
      currency="USD"
      // FIXME: Default channel in our sandbox (Store: EU, US, CA)
      channelId="bfb69a22-2ee2-4c1c-9f45-f9703c3ea77c"
    />
  );
}

ProductsCollection.fragment = ProductCardsFragment;
