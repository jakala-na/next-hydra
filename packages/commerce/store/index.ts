import { locales, regions } from "@repo/i18n/config";
import type { SupportedLocale } from "@repo/i18n/config";
import { Schema } from "effect";

import { CurrencyCode } from "../domain/money";

export const CommerceLocale = Schema.Literals(locales).pipe(
  Schema.brand("CommerceLocale")
);
export type CommerceLocale = typeof CommerceLocale.Type;

export const StoreKey = Schema.NonEmptyString.pipe(Schema.brand("StoreKey"));
export type StoreKey = typeof StoreKey.Type;

export class Store extends Schema.Class<Store>("Store")({
  currency: CurrencyCode,
  locale: CommerceLocale,
  storeKey: StoreKey,
}) {}

export interface ConfiguredStore {
  readonly storeKey: StoreKey;
  readonly locale: CommerceLocale;
  readonly currency: CurrencyCode;
  readonly isDefault: boolean;
}

export type StoreConfiguration = readonly ConfiguredStore[];

const defaultStoreKeyByLocale = {
  "de-DE": "de-fr-uk",
  "en-GB": "de-fr-uk",
  "en-US": "default-store",
  "es-ES": "default-store",
  "fr-FR": "de-fr-uk",
  "it-IT": "default-store",
  "nl-NL": "default-store",
  "pt-PT": "default-store",
} as const satisfies Record<SupportedLocale, string>;

export const storeConfiguration: StoreConfiguration = regions.map(
  ({ currency, localeCode }) => ({
    currency: CurrencyCode.make(currency),
    isDefault: true,
    locale: CommerceLocale.make(localeCode),
    storeKey: StoreKey.make(defaultStoreKeyByLocale[localeCode]),
  })
);

export interface StoreSelection {
  readonly locale: CommerceLocale;
  readonly selectedStoreKey?: StoreKey;
}

export const resolveStore = (
  selection: StoreSelection,
  configuration: StoreConfiguration = storeConfiguration
): Store => {
  const eligibleStores = configuration.filter(
    ({ locale }) => locale === selection.locale
  );
  const selectedStore =
    selection.selectedStoreKey === undefined
      ? undefined
      : eligibleStores.find(
          ({ storeKey }) => storeKey === selection.selectedStoreKey
        );
  const resolvedStore =
    selectedStore ?? eligibleStores.find(({ isDefault }) => isDefault);

  if (resolvedStore === undefined) {
    throw new Error(
      `A default Store is not configured for locale ${selection.locale}`
    );
  }

  return new Store({
    currency: resolvedStore.currency,
    locale: resolvedStore.locale,
    storeKey: resolvedStore.storeKey,
  });
};
