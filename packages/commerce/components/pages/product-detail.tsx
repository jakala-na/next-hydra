import { productService } from "@repo/commerce/lib/product/product.service";
import { ProductDetail } from "@repo/design-system/components/commerce/blocks/product-detail";
import { hasLocale, setRequestLocale } from "@repo/i18n";
import { routing } from "@repo/i18n/routing";
import type { Locale } from "@repo/i18n/types";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

export async function generateMetadata(props: {
  params: Promise<{ slug: string; locale: Locale }>;
}): Promise<Metadata> {
  const { slug, locale } = await props.params;

  const productResult = await productService.getProductBySlug(slug, locale);

  if (!productResult) {
    return notFound();
  }
  const product = productResult;
  const { title, description, seo } = product;
  const indexable = true; // TODO: Define logic for indexable.

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
  params: Promise<{ slug: string; locale: Locale }>;
}) {
  const { slug, locale } = await props.params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);

  const productResult = await productService.getProductBySlug(slug, locale);

  if (!productResult) {
    return notFound();
  }
  const product = productResult;

  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    description: product.description,
    image: product.images?.[0]?.url,
    offers: {
      "@type": "AggregateOffer",
      availability: product.availableForSale
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
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
        // biome-ignore lint/security/noDangerouslySetInnerHtml: ignore
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(productJsonLd),
        }}
      />
      <ProductDetail productData={product} />
    </>
  );
}
