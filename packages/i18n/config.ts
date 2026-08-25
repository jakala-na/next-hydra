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
    currency: "USD",
    displayCode: "US",
    displayName: "United States (English)",
    localeCode: "en-US",
  },
  {
    currency: "GBP",
    displayCode: "GB",
    displayName: "United Kingdom (English)",
    localeCode: "en-GB",
  },
  {
    currency: "EUR",
    displayCode: "ES",
    displayName: "Spain (Spanish)",
    localeCode: "es-ES",
  },
  {
    currency: "EUR",
    displayCode: "FR",
    displayName: "France (French)",
    localeCode: "fr-FR",
  },
  {
    currency: "EUR",
    displayCode: "DE",
    displayName: "Germany (German)",
    localeCode: "de-DE",
  },
  {
    currency: "EUR",
    displayCode: "IT",
    displayName: "Italy (Italian)",
    localeCode: "it-IT",
  },
  {
    currency: "EUR",
    displayCode: "PT",
    displayName: "Portugal (Portuguese)",
    localeCode: "pt-PT",
  },
  {
    currency: "EUR",
    displayCode: "NL",
    displayName: "Netherlands (Dutch)",
    localeCode: "nl-NL",
  },
] as const satisfies readonly {
  readonly displayCode: string;
  readonly displayName: string;
  readonly currency: string;
  readonly localeCode: SupportedLocale;
}[];
