import ProductCard from '@repo/design-system/components/commerce-ui/product-card';
import Link from 'next/link';
import { getFeaturedProducts } from '../get-featured-products';

export default async function FeaturedProducts() {
  const products = await getFeaturedProducts();
  if (!products.length) {
    return null;
  }
  return (
    <section className="flex flex-row gap-6">
      {products.map((product) => {
        const data = product;
        const variant = data.masterVariant;
        const imageUrl = variant.images?.[0]?.url;
        const priceCent = variant.prices?.[0]?.value.centAmount;
        const price = priceCent ? priceCent / 100 : 0;
        const prefix =
          variant.prices?.[0]?.value.currencyCode === 'USD'
            ? '$'
            : variant.prices?.[0]?.value.currencyCode;
        const slug = data.slug;
        return (
          <ProductCard
            key={product.id}
            title={data.name ?? ''}
            description={data.description ?? ''}
            imageUrl={imageUrl}
            price={price}
            prefix={prefix}
            cta={<Link href={`/product/${slug}`}>Shop</Link>}
          />
        );
      })}
    </section>
  );
}
