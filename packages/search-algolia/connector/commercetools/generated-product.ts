// This file is generated. Do not edit it manually.
// Run `pnpm cli search types generate` to regenerate.

import type { FieldPath } from "@repo/commerce/product";

export const ALGOLIA_CONNECTOR_LOCALES = [
  "en-US",
  "en-GB",
  "es-ES",
  "fr-FR",
  "de-DE",
  "it-IT",
  "pt-PT",
  "nl-NL",
] as const;
export type AlgoliaConnectorLocale = (typeof ALGOLIA_CONNECTOR_LOCALES)[number];

export const ALGOLIA_CONNECTOR_CURRENCIES = ["USD", "GBP", "EUR"] as const;
export type AlgoliaConnectorCurrency =
  (typeof ALGOLIA_CONNECTOR_CURRENCIES)[number];

export const isAlgoliaConnectorCurrency = (
  currency: string
): currency is AlgoliaConnectorCurrency =>
  ALGOLIA_CONNECTOR_CURRENCIES.some(
    (candidate: string) => candidate === currency
  );

export const algoliaConnectorCurrency = (
  currency: string
): AlgoliaConnectorCurrency => {
  if (!isAlgoliaConnectorCurrency(currency)) {
    throw new Error(`Unsupported Algolia connector currency ${currency}`);
  }
  return currency;
};

export const isAlgoliaConnectorLocale = (
  locale: string
): locale is AlgoliaConnectorLocale =>
  ALGOLIA_CONNECTOR_LOCALES.some((candidate: string) => candidate === locale);

export const algoliaConnectorLocale = (
  locale: string
): AlgoliaConnectorLocale => {
  if (!isAlgoliaConnectorLocale(locale)) {
    throw new Error(`Unsupported Algolia connector locale ${locale}`);
  }
  return locale;
};

export type LocalizedStringByAlgoliaConnectorLocale = Partial<
  Record<AlgoliaConnectorLocale, string>
>;

export interface AlgoliaCommercetoolsRootAttributes {
  readonly capacity?: number;
  readonly iso45001?: boolean;
  readonly mobility?: string;
  readonly relatedProducts?: readonly string[];
}

export interface AlgoliaCommercetoolsVariantAttributes {
  readonly color?: LocalizedStringByAlgoliaConnectorLocale;
  readonly model?: number;
}

export interface AlgoliaCommercetoolsRawPriceValue {
  readonly channelID?: string;
  readonly customerGroupID?: string;
  readonly discountedValue?: number;
  readonly discountID?: string;
  readonly id: string;
  readonly value: number;
}

export interface AlgoliaCommercetoolsRawPriceBucket {
  readonly max?: number;
  readonly min: number;
  readonly priceValues?: readonly AlgoliaCommercetoolsRawPriceValue[];
}

export interface AlgoliaCommercetoolsImageObject {
  readonly dimensions?: {
    readonly height: number;
    readonly width: number;
  };
  readonly label?: string;
  readonly url: string;
}

export type AlgoliaCommercetoolsImage =
  | string
  | AlgoliaCommercetoolsImageObject;

export interface AlgoliaCommercetoolsRawVariant {
  readonly attributes?: AlgoliaCommercetoolsVariantAttributes;
  readonly id: string;
  readonly images?: readonly AlgoliaCommercetoolsImage[];
  readonly isInStock?: boolean;
  readonly key?: string;
  readonly prices?: Partial<
    Record<AlgoliaConnectorCurrency, AlgoliaCommercetoolsRawPriceBucket>
  >;
  readonly sku?: string;
}

export interface AlgoliaCommercetoolsRawProduct {
  readonly attributes?: AlgoliaCommercetoolsRootAttributes;
  readonly categories?: Partial<
    Record<AlgoliaConnectorLocale, Readonly<Record<string, readonly string[]>>>
  >;
  readonly categoryKeys?: Partial<
    Record<AlgoliaConnectorLocale, readonly string[]>
  >;
  readonly description?: LocalizedStringByAlgoliaConnectorLocale;
  readonly key?: string;
  readonly name?: LocalizedStringByAlgoliaConnectorLocale;
  readonly objectID: string;
  readonly productType?: string;
  readonly slug?: LocalizedStringByAlgoliaConnectorLocale;
  readonly variants: readonly AlgoliaCommercetoolsRawVariant[];
}

export interface AlgoliaProductCategory {
  readonly key: string;
  readonly label: LocalizedStringByAlgoliaConnectorLocale;
}

export interface AlgoliaProductMoney {
  readonly centAmount: number;
  readonly currencyCode: AlgoliaConnectorCurrency;
}

export interface AlgoliaProductCardRecord {
  readonly availableForSale: boolean;
  readonly description?: LocalizedStringByAlgoliaConnectorLocale;
  readonly featuredImage?: {
    readonly altText?: string;
    readonly url: string;
  };
  readonly id: string;
  readonly slug: LocalizedStringByAlgoliaConnectorLocale;
  readonly startingPrice?: Partial<
    Record<AlgoliaConnectorCurrency, AlgoliaProductMoney>
  >;
  readonly title: LocalizedStringByAlgoliaConnectorLocale;
}

export interface AlgoliaProductVariantRecord {
  readonly attributes?: AlgoliaCommercetoolsVariantAttributes;
  readonly id: string;
  readonly key?: string;
  readonly sku?: string;
}

/** Provider record stored once per Product price-audience slice. */
export interface AlgoliaProductRecord {
  readonly attributes?: AlgoliaCommercetoolsRootAttributes;
  readonly availability: "in-stock" | "out-of-stock";
  readonly categories: readonly AlgoliaProductCategory[];
  readonly category: Partial<Record<AlgoliaConnectorLocale, readonly string[]>>;
  readonly priceAudienceIds: readonly string[];
  readonly objectID: string;
  readonly price?: Partial<Record<AlgoliaConnectorCurrency, number>>;
  readonly productCard: AlgoliaProductCardRecord;
  readonly variants: readonly AlgoliaProductVariantRecord[];
}

export type AlgoliaCommercetoolsProductFieldPath =
  FieldPath<AlgoliaCommercetoolsRawProduct>;

export type AlgoliaProductFieldPath = FieldPath<AlgoliaProductRecord>;

export const algoliaProductFieldPath = <Path extends AlgoliaProductFieldPath>(
  path: Path
): Path => path;
