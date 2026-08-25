import type { regions, SupportedLocale } from "./config";

export type Locale = SupportedLocale;
export type LocaleLower = Lowercase<Locale>;
export type LocaleLanguage = Locale extends `${infer L}-${string}` ? L : never;
export type LocaleCountry = Locale extends `${string}-${infer C}` ? C : never;

export type LocalizedString = Partial<Record<Locale, string>> &
  Record<Locale, string>[Locale];

export type CurrencyCode = (typeof regions)[number]["currency"];
