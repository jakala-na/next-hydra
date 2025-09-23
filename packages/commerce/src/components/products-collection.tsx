import ProductCard from '@repo/design-system/components/commerce-ui/product-card';
import Link from 'next/link';

import { getProductsCollection } from '../catalog';

export type ProductsCollectionProps = {
  title: string;
  categoryId: string;
  locale: string;
  currency: string;
  channelId: string;
  limit?: number;
};

export default async function ProductsCollection({
  title,
  categoryId,
  locale,
  currency,
  channelId,
  limit = 3,
}: ProductsCollectionProps) {
  const products = await getProductsCollection({
    categoryId,
    locale,
    currency,
    channelId,
    limit,
  });

  if (products.length === 0) {
    return null;
  }

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
              imageUrl={product.featuredImage?.url}
              imageTitle={product.featuredImage?.altText}
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
