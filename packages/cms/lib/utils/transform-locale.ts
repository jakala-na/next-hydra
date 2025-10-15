import type { CMSLocale } from "@repo/cms/types";
import type { Locale } from "@repo/i18n";

export const transformLocale = (locale: Locale) =>
  locale.toLowerCase() as CMSLocale;
