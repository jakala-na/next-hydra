import { getProduct } from '@repo/commerce/lib/product';
import ProductVariantExample from '@repo/design-system/components/commerce-ui/product-variants-01-ex';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
export async function generateMetadata(props: {
  params: Promise<{ handle: string }>;
}): Promise<Metadata> {
  const params = await props.params;
  const productResult = await getProduct({
    productKey: params.handle,
    locale: 'en-US',
    currency: 'USD',
    channelId: 'bfb69a22-2ee2-4c1c-9f45-f9703c3ea77c',
  });

  if (!productResult.data) {
    return notFound();
  }
  const product = productResult.data;
  const { title, description, seo } = product;
  const indexable = false;

  return {
    title: seo.title || title,
    description: seo.description || description,
    robots: {
      index: indexable,
      follow: indexable,
      googleBot: {
        index: indexable,
        follow: indexable,
      },
    },
    // TODO: Add openGraph.
    // openGraph: url
    //   ? {
    //       images: [
    //         {
    //           url,
    //           width,
    //           height,
    //           alt,
    //         },
    //       ],
    //     }
    //   : null,
  };
}

export default async function ProductPage(props: {
  params: Promise<{ handle: string }>;
}) {
  const params = await props.params;
  const productResult = await getProduct({
    productKey: params.handle,
    locale: 'en-US',
    currency: 'USD',
    channelId: 'bfb69a22-2ee2-4c1c-9f45-f9703c3ea77c',
  });

  if (!productResult.data) {
    return notFound();
  }
  const product = productResult.data;

  const productJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.title,
    description: product.description,
    image: product.images?.[0]?.url,
    offers: {
      '@type': 'AggregateOffer',
      availability: product.availableForSale
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      // TODO: Add price.
      // priceCurrency: product.priceRange.minVariantPrice.currencyCode,
      // highPrice: product.priceRange.maxVariantPrice.amount,
      // lowPrice: product.priceRange.minVariantPrice.amount,
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(productJsonLd),
        }}
      />
      <ProductVariantExample />
    </>
  );
}
