import type { Locale } from "@repo/i18n";

const DEFAULT_DRUPAL_LANGCODE = "en";
const LEADING_SLASHES = /^\/+/;

export const drupalLangcodeByLocale = {
  "de-DE": "de",
  "en-GB": "en-gb",
  "en-US": DEFAULT_DRUPAL_LANGCODE,
  "es-ES": "es",
  "fr-FR": "fr",
  "it-IT": "it",
  "nl-NL": "nl",
  "pt-PT": "pt-pt",
} as const satisfies Record<Locale, string>;

export type DrupalLangcode =
  (typeof drupalLangcodeByLocale)[keyof typeof drupalLangcodeByLocale];

const drupalLangcodes = new Set<string>(Object.values(drupalLangcodeByLocale));

export function isDrupalLangcode(
  value: string | null | undefined
): value is DrupalLangcode {
  return typeof value === "string" && drupalLangcodes.has(value);
}

export function toDrupalLangcode(locale: Locale): DrupalLangcode {
  return drupalLangcodeByLocale[locale];
}

export function toDrupalPath(path: string, locale: Locale): string {
  const normalizedPath =
    path === "/" ? path : `/${path.replace(LEADING_SLASHES, "")}`;
  if (toDrupalLangcode(locale) === DEFAULT_DRUPAL_LANGCODE) {
    return normalizedPath;
  }

  return normalizedPath === "/" ? `/${locale}` : `/${locale}${normalizedPath}`;
}
