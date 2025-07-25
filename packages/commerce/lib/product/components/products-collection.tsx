import ProductCard from '@repo/design-system/components/commerce-ui/product-card';
import Link from 'next/link';
import { getProductsCollection } from '../actions/get-products-collection';

export default async function ProductsCollection(props: { title: string; categoryId: string }) {
  const { title, categoryId } = props;
  // TODO: Pass locale from page.
  const res = await getProductsCollection({
    categoryId,
    limit: 3,
    locale: 'en-US',
    currency: 'USD',
    // FIXME: Default channel in our sandbox.
    channelId: 'bfb69a22-2ee2-4c1c-9f45-f9703c3ea77c',
  });

  if (!res.data || res.data.length === 0) {
    return null;
  }

  const products = res.data;
  return (
    <>
      <h3>{title}</h3>
      <section className="flex flex-row gap-6">
        {products.map((product) => {
          return (
            <ProductCard
              key={product.id}
              title={product.title}
              description={product.description}
              imageUrl={product.imageUrl}
              price={product.priceFrom}
              prefix={`From ${product.currency}`}
              cta={<Link href={`/product/${product.slug}`}>Shop</Link>}
            />
          );
        })}
      </section>
    </>
  );
}
