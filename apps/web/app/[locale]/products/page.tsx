import { hasLocale, setRequestLocale } from "@repo/i18n";
import { routing } from "@repo/i18n/routing";
import { ProductListingPage } from "@repo/search/product-listing-page";
import { notFound } from "next/navigation";

export default async function ProductsPage({
  params,
  searchParams,
}: PageProps<"/[locale]/products">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  // oxlint-disable-next-line typescript/no-deprecated -- Match the repository's current next-intl static-rendering contract until its root-params migration lands.
  setRequestLocale(locale);

  return <ProductListingPage locale={locale} searchParams={searchParams} />;
}
