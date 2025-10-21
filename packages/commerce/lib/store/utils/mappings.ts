import { regions } from "@repo/i18n/config";
import type { CurrencyCode, Locale } from "@repo/i18n/types";

export const storeKeys = ["de-fr-uk", "default-store"] as const;
export type StoreKey = (typeof storeKeys)[number];

const defaultStoreKey = "default-store";
export const getStoreKeyByLocale = (locale: Locale): StoreKey => {
  const mapping: Record<Locale, StoreKey> = {
    "en-US": "default-store",
    "es-ES": "default-store",
    "it-IT": "default-store",
    "pt-PT": "default-store",
    "nl-NL": "default-store",
    "en-GB": "de-fr-uk",
    "fr-FR": "de-fr-uk",
    "de-DE": "de-fr-uk",
  };

  return mapping[locale] ?? defaultStoreKey;
};

export const getDefaultCurrencyByLocale = (locale: Locale): CurrencyCode => {
  const mapping = regions.reduce(
    (acc, region) => {
      acc[region.localeCode as Locale] = region.currency as CurrencyCode;
      return acc;
    },
    {} as Record<Locale, CurrencyCode>
  );
  return mapping[locale] ?? "USD";
};
