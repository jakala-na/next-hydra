import type { Locale } from "@repo/i18n";

import type { CMSLocale } from "../../types";

export const transformLocale = (locale: Locale) =>
  locale.toLowerCase() as CMSLocale;
