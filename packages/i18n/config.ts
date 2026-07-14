export const locales = [
  "en-US",
  "en-GB",
  "es-ES",
  "fr-FR",
  "de-DE",
  "it-IT",
  "pt-PT",
  "nl-NL",
] as const;

export type SupportedLocale = (typeof locales)[number];

export const regions = [
  {
    displayCode: "US",
    displayName: "United States (English)",
    currency: "USD",
    localeCode: "en-US",
  },
  {
    displayCode: "GB",
    displayName: "United Kingdom (English)",
    currency: "GBP",
    localeCode: "en-GB",
  },
  {
    displayCode: "ES",
    displayName: "Spain (Spanish)",
    currency: "EUR",
    localeCode: "es-ES",
  },
  {
    displayCode: "FR",
    displayName: "France (French)",
    currency: "EUR",
    localeCode: "fr-FR",
  },
  {
    displayCode: "DE",
    displayName: "Germany (German)",
    currency: "EUR",
    localeCode: "de-DE",
  },
  {
    displayCode: "IT",
    displayName: "Italy (Italian)",
    currency: "EUR",
    localeCode: "it-IT",
  },
  {
    displayCode: "PT",
    displayName: "Portugal (Portuguese)",
    currency: "EUR",
    localeCode: "pt-PT",
  },
  {
    displayCode: "NL",
    displayName: "Netherlands (Dutch)",
    currency: "EUR",
    localeCode: "nl-NL",
  },
] as const satisfies readonly {
  readonly displayCode: string;
  readonly displayName: string;
  readonly currency: string;
  readonly localeCode: SupportedLocale;
}[];
