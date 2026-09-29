import {
  generateMetadataHandler,
  ProductDetailPage,
} from "@repo/commerce/product/product-detail";
import { ArchitectureBoundary } from "@repo/demo-architecture/boundary";
import { ProductDetailSkeleton } from "@repo/design-system/components/commerce/blocks/product-detail-skeleton";
import { hasLocale, setRequestLocale } from "@repo/i18n";
import { routing } from "@repo/i18n/routing";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/product/[slug]">): Promise<Metadata> {
  const { slug, locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  return await generateMetadataHandler({ locale, slug });
}

export default async function ProductDetail({
  params,
}: PageProps<"/[locale]/product/[slug]">) {
  const { slug, locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  // oxlint-disable-next-line typescript/no-deprecated -- Migrate to root params later.
  setRequestLocale(locale);
  return (
    <ArchitectureBoundary
      name="Product page"
      description="Shows a placeholder while product details load."
      streaming
    >
      <Suspense fallback={<ProductDetailSkeleton />}>
        <ProductDetailPage slug={slug} locale={locale} />
      </Suspense>
    </ArchitectureBoundary>
  );
}
