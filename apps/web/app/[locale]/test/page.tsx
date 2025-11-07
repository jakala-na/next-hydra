import { hasLocale, type Locale, setRequestLocale } from "@repo/i18n";
import { routing } from "@repo/i18n/routing";
import { notFound } from "next/navigation";

export default async function TestPage(props: PageProps<"/[locale]/test">) {
  const { locale } = await props.params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale as Locale);
  return <div>Test Page {locale}</div>;
}
