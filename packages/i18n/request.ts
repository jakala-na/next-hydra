import { hasLocale } from "next-intl";
import type { Formats } from "next-intl";
import { getRequestConfig } from "next-intl/server";

import { routing } from "./routing";

export const formats = {
  dateTime: {
    short: {
      day: "numeric",
      month: "short",
      year: "numeric",
    },
  },
  list: {
    enumeration: {
      style: "long",
      type: "conjunction",
    },
  },
  number: {
    wholeMoneyWithCurrency: {
      currencyDisplay: "narrowSymbol",
      maximumFractionDigits: 0,
      minimumFractionDigits: 0,
      style: "currency",
    },
  },
} satisfies Formats;

export default getRequestConfig(async ({ requestLocale }) => {
  // Typically corresponds to the `[locale]` segment
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  return {
    formats,
    locale,
    messages: (await import(`./messages/${locale}.json`)).default,
  };
});
