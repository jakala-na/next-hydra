import { locales, regions, type SupportedLocale } from "@repo/i18n/config";
import { Schema } from "effect";
import { CurrencyCode } from "../domain/money";

export const CommerceLocale = Schema.Literals(locales).pipe(
  Schema.brand("CommerceLocale")
);
export type CommerceLocale = typeof CommerceLocale.Type;

export const StoreKey = Schema.NonEmptyString.pipe(Schema.brand("StoreKey"));
export type StoreKey = typeof StoreKey.Type;

export class Store extends Schema.Class<Store>("Store")({
  storeKey: StoreKey,
  locale: CommerceLocale,
  currency: CurrencyCode,
}) {}

export interface ConfiguredStore {
  readonly storeKey: StoreKey;
  readonly locale: CommerceLocale;
  readonly currency: CurrencyCode;
  readonly isDefault: boolean;
}

export type StoreConfiguration = readonly ConfiguredStore[];

const defaultStoreKeyByLocale = {
  "en-US": "default-store",
  "es-ES": "default-store",
  "it-IT": "default-store",
  "pt-PT": "default-store",
  "nl-NL": "default-store",
  "en-GB": "de-fr-uk",
  "fr-FR": "de-fr-uk",
  "de-DE": "de-fr-uk",
} as const satisfies Record<SupportedLocale, string>;

export const storeConfiguration: StoreConfiguration = regions.map(
  ({ currency, localeCode }) => ({
    storeKey: StoreKey.make(defaultStoreKeyByLocale[localeCode]),
    locale: CommerceLocale.make(localeCode),
    currency: CurrencyCode.make(currency),
    isDefault: true,
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
    storeKey: resolvedStore.storeKey,
    locale: resolvedStore.locale,
    currency: resolvedStore.currency,
  });
};
