import type { Locale } from "@repo/i18n";
import { routing } from "@repo/i18n/routing";

const DEFAULT_DRUPAL_LANGCODE = "en";
const LEADING_SLASHES = /^\/+/u;

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
  return value !== null && value !== undefined && drupalLangcodes.has(value);
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

/** Map verified Canvas preview language to the application's locale URL. */
export function toCanvasPreviewPath(path: string, language?: string): string {
  const locale = routing.locales.find(
    (candidate) => drupalLangcodeByLocale[candidate] === language
  );
  if (!locale) {
    return path;
  }
  const url = new URL(path, "https://preview.invalid");
  const segments = url.pathname.split("/");
  if (segments[1] && Object.hasOwn(drupalLangcodeByLocale, segments[1])) {
    segments.splice(1, 1);
  }
  return `${toDrupalPath(segments.join("/") || "/", locale)}${url.search}${url.hash}`;
}
