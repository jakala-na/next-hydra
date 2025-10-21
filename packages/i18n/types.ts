import type { Locale as NextIntlLocale } from "next-intl";
import type { regions } from "./config";

export type Locale = NextIntlLocale;
export type LocaleLower = Lowercase<Locale>;
export type LocaleLanguage = Locale extends `${infer L}-${string}` ? L : never;
export type LocaleCountry = Locale extends `${string}-${infer C}` ? C : never;

export type LocalizedString = Partial<Record<Locale, string>> &
  {
    [K in Locale]: string;
  }[Locale];

export type CurrencyCode = (typeof regions)[number]["currency"];
