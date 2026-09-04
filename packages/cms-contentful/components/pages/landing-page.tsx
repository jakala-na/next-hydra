import type { Locale } from "@repo/i18n";
import { hasLocale } from "@repo/i18n";
import { routing } from "@repo/i18n/routing";
import { draftMode } from "next/headers";
import { notFound } from "next/navigation";

type LandingPageProps = {
  locale: Locale;
  url: string;
};

export async function LandingPage({ locale }: LandingPageProps) {
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  await draftMode();

  notFound();
}
