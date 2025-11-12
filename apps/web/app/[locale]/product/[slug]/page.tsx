import {
  generateMetadataHandler,
  ProductDetailPage,
} from "@repo/commerce/components/pages/product-detail";
import { hasLocale, setRequestLocale } from "@repo/i18n";
import { routing } from "@repo/i18n/routing";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/product/[slug]">): Promise<Metadata> {
  const { slug, locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  return generateMetadataHandler({ slug, locale });
}

export default async function ProductDetail({
  params,
}: PageProps<"/[locale]/product/[slug]">) {
  const { slug, locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);
  return <ProductDetailPage slug={slug} locale={locale} />;
}
