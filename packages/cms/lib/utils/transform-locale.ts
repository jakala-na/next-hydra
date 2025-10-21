import type { CMSLocale } from "@repo/cms/types";
import type { Locale } from "@repo/i18n";

export const transformLocale = (locale: Locale) => {
  switch (locale) {
    case 'en-US':
      return 'en';
    default:
      return 'en';
  }
}
