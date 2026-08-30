import type { SupportedLocale } from "@repo/i18n/config";
import { routing } from "@repo/i18n/routing";

const isApplicationRoute = (href: string): boolean =>
  href.startsWith("/") &&
  !href.startsWith("//") &&
  href !== "/api" &&
  !href.startsWith("/api/");

export const localizeAuthHref = (
  href: string,
  locale: SupportedLocale
): string => {
  if (!isApplicationRoute(href) || locale === routing.defaultLocale) {
    return href;
  }
  return `/${locale}${href}`;
};
