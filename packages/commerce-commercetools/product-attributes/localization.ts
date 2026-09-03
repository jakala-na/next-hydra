import { locales } from "@repo/i18n/config";
import type { Locale } from "@repo/i18n/types";
import { Option } from "effect";

const isNonBlank = (value: string | undefined): value is string =>
  value !== undefined && value.trim().length > 0;

const localePriorityFor = (requestedLocale: Locale): readonly Locale[] => [
  requestedLocale,
  ...locales.filter((locale) => locale !== requestedLocale),
];

export const localizedTextForLocale = (
  value: Readonly<Record<string, string>>,
  locale: Locale
): Option.Option<string> =>
  Option.fromNullishOr(
    localePriorityFor(locale)
      .map((candidate) => value[candidate])
      .find(isNonBlank)
  );
