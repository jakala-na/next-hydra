import { hasLocale, setRequestLocale } from "@repo/i18n";
import { routing } from "@repo/i18n/routing";
import { SearchPage } from "@repo/search/search-page";
import { notFound } from "next/navigation";

export default async function SearchRoute({
  params,
  searchParams,
}: PageProps<"/[locale]/search">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  // oxlint-disable-next-line typescript/no-deprecated -- Match the repository's current next-intl static-rendering contract until its root-params migration lands.
  setRequestLocale(locale);

  return <SearchPage locale={locale} searchParams={searchParams} />;
}
