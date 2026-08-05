import { LandingPage } from "@repo/cms/components/pages/landing-page";
import { hasLocale, setRequestLocale } from "@repo/i18n";
import { routing } from "@repo/i18n/routing";
import { notFound } from "next/navigation";
import { env } from "@/env";
import { resolveCmsPagePath } from "@/lib/cms-routing";

export default async function Page({
  params,
}: PageProps<"/[locale]/[[...url]]">) {
  const { url, locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);
  const urlStr = resolveCmsPagePath(url, env.CMS_HOMEPAGE_SLUG);
  return <LandingPage url={urlStr} locale={locale} />;
}
