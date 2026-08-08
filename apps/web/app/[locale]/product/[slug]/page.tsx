import {
  generateMetadataHandler,
  ProductDetailPage,
} from "@repo/commerce/product/product-detail";
import { ArchitectureBoundary } from "@repo/design-system/components/architecture/architecture-boundary";
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
  return generateMetadataHandler({ locale, slug });
}

export default async function ProductDetail({
  params,
}: PageProps<"/[locale]/product/[slug]">) {
  const { slug, locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);
  return (
    <ArchitectureBoundary
      component="server"
      description="A prerendered product route shell that streams buyer-specific Commerce content."
      layer="route"
      layerLabel="App Router product shell"
      name="ProductRoute"
      rendering="static"
      source="app"
      sourceLabel="Next.js application"
    >
      <Suspense
        fallback={
          <ArchitectureBoundary
            component="server"
            description="The product shell shown while buyer-specific pricing, availability, and variants resolve."
            layer="orchestration"
            layerLabel="Suspense stream fallback"
            name="DynamicProductDetail (pending)"
            rendering="streamed"
            source="commerce"
            sourceLabel="Commerce provider"
          >
            <ProductDetailSkeleton />
          </ArchitectureBoundary>
        }
      >
        <ProductDetailPage slug={slug} locale={locale} />
      </Suspense>
    </ArchitectureBoundary>
  );
}
