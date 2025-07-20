import ProductCard from '@repo/design-system/components/commerce-ui/product-card';
import Link from 'next/link';
import { getFeaturedProducts } from '../actions/get-featured-products';

export default async function FeaturedProducts() {
  const res = await getFeaturedProducts();

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
            price={product.price}
            prefix={product.currency}
            cta={<Link href={`/product/${product.slug}`}>Shop</Link>}
          />
        );
      })}
    </section>
  );
}
