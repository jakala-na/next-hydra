import ProductCard from '@repo/design-system/components/commerce-ui/product-card';
import Link from 'next/link';
import { getProductsCollection } from '../actions/get-products-collection';

export default async function ProductsCollection(props: { categoryKey: string }) {
  const { categoryKey } = props;
  // TODO: Pass locale from page.
  const res = await getProductsCollection({ categoryKey, limit: 3, locale: 'en-US', currency: 'USD' });

  if (!res.data || res.data.length === 0) {
    return null;
  }

  const products = res.data;
  return (
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
  );
}
