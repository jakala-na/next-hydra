/* oxlint-disable anti-slop/no-runtime-typeof, anti-slop/no-unknown-parameters, anti-slop/no-unsafe-dictionary-type, eslint/require-await -- Algolia executes this generated transformation without imports, requires an async transform entry point, and supplies untyped connector records and JSON configuration. */

import type {
  AlgoliaCommercetoolsRawPriceValue,
  AlgoliaCommercetoolsRawProduct,
  AlgoliaCommercetoolsRawVariant,
  AlgoliaConnectorCurrency,
  AlgoliaConnectorLocale,
  AlgoliaProductCategory,
  AlgoliaProductMoney,
  AlgoliaProductRecord,
} from "./generated-product";
import {
  ALGOLIA_CONNECTOR_CURRENCIES,
  ALGOLIA_CONNECTOR_LOCALES,
} from "./generated-product";

export interface AlgoliaCommercetoolsTransformationConfiguration {
  readonly priceCustomerGroupIds: readonly string[];
}

interface AlgoliaTransformationHelper {
  readonly secrets?: {
    readonly get?: (name: string) => string | undefined;
  };
}

export const ALGOLIA_COMMERCETOOLS_CONFIGURATION_SECRET_NAME = "CONFIGURATION";

const ALGOLIA_COMMERCETOOLS_CONFIGURATION_VERSION = 4;

export const serializeAlgoliaCommercetoolsTransformationConfiguration = (
  configuration: AlgoliaCommercetoolsTransformationConfiguration
): string =>
  JSON.stringify({
    version: ALGOLIA_COMMERCETOOLS_CONFIGURATION_VERSION,
    ...configuration,
  });

interface PriceCandidate {
  centAmount: number;
  customerGroupID?: string;
}

interface PriceSlice {
  readonly audienceIds: string[];
  readonly price: Partial<Record<AlgoliaConnectorCurrency, number>>;
  readonly startingPrice: Partial<
    Record<AlgoliaConnectorCurrency, AlgoliaProductMoney>
  >;
}

interface LocalizedProductCategories {
  readonly categories: readonly AlgoliaProductCategory[];
  readonly category: Partial<Record<AlgoliaConnectorLocale, readonly string[]>>;
}

const publicAudience = "public";

const image = (variants: readonly AlgoliaCommercetoolsRawVariant[]) => {
  for (const variant of variants) {
    const [candidate] = variant.images ?? [];
    if (candidate !== undefined) {
      if (typeof candidate === "string") {
        return { url: candidate };
      }
      const { url } = candidate;
      return candidate.label === undefined
        ? { url }
        : { altText: candidate.label, url };
    }
  }
  return undefined;
};

const isAvailable = (variants: readonly AlgoliaCommercetoolsRawVariant[]) =>
  variants.some((variant) => variant.isInStock === true);

const priceCandidates = (
  variant: AlgoliaCommercetoolsRawVariant,
  currency: AlgoliaConnectorCurrency
): PriceCandidate[] =>
  (variant.prices?.[currency]?.priceValues ?? []).map(
    (price: AlgoliaCommercetoolsRawPriceValue) => {
      const candidate: PriceCandidate = {
        centAmount: price.discountedValue ?? price.value,
      };
      if (price.customerGroupID !== undefined) {
        candidate.customerGroupID = price.customerGroupID;
      }
      return candidate;
    }
  );

const priceForAudience = (
  candidates: readonly PriceCandidate[],
  audienceID: string | undefined
): number | undefined => {
  const audiencePrices = candidates.filter(
    ({ customerGroupID }) => customerGroupID === audienceID
  );
  const fallbackPrices = candidates.filter(
    ({ customerGroupID }) => customerGroupID === undefined
  );
  const selected = audiencePrices.length > 0 ? audiencePrices : fallbackPrices;
  let lowest: number | undefined;
  for (const candidate of selected) {
    if (lowest === undefined || candidate.centAmount < lowest) {
      lowest = candidate.centAmount;
    }
  }
  return lowest;
};

const categoriesFromRecord = (
  record: AlgoliaCommercetoolsRawProduct
): LocalizedProductCategories => {
  const categories = new Map<string, AlgoliaProductCategory>();
  const category: Partial<Record<AlgoliaConnectorLocale, readonly string[]>> =
    {};
  for (const locale of ALGOLIA_CONNECTOR_LOCALES) {
    const keys = record.categoryKeys?.[locale] ?? [];
    category[locale] = keys;
    const labels = Object.values(record.categories?.[locale] ?? {}).flatMap(
      (paths) => paths.map((path) => path.split(" > ").at(-1) ?? path)
    );
    for (const [index, key] of keys.entries()) {
      const existing = categories.get(key) ?? { key, label: {} };
      existing.label[locale] = labels[index] ?? key;
      categories.set(key, existing);
    }
  }
  return { categories: [...categories.values()], category };
};

const priceBagSignature = (
  startingPrice: Partial<Record<AlgoliaConnectorCurrency, AlgoliaProductMoney>>
): string =>
  JSON.stringify(
    Object.entries(startingPrice).map(([currency, money]) => [
      currency,
      money.currencyCode,
      money.centAmount,
    ])
  );

const priceSlices = (
  variants: readonly AlgoliaCommercetoolsRawVariant[],
  currencies: readonly AlgoliaConnectorCurrency[],
  priceCustomerGroupIds: readonly string[]
): PriceSlice[] => {
  const candidatesByCurrency = new Map<
    AlgoliaConnectorCurrency,
    PriceCandidate[][]
  >();
  for (const currency of currencies) {
    candidatesByCurrency.set(
      currency,
      variants.map((variant) => priceCandidates(variant, currency))
    );
  }
  const slices = new Map<string, PriceSlice>();
  const audienceIds = [undefined, ...priceCustomerGroupIds];
  for (const audienceId of audienceIds) {
    const price: Partial<Record<AlgoliaConnectorCurrency, number>> = {};
    const startingPrice: Partial<
      Record<AlgoliaConnectorCurrency, AlgoliaProductMoney>
    > = {};
    for (const currency of currencies) {
      let centAmount: number | undefined;
      for (const candidates of candidatesByCurrency.get(currency) ?? []) {
        const variantPrice = priceForAudience(candidates, audienceId);
        if (
          variantPrice !== undefined &&
          (centAmount === undefined || variantPrice < centAmount)
        ) {
          centAmount = variantPrice;
        }
      }
      if (centAmount !== undefined) {
        price[currency] = centAmount / 100;
        startingPrice[currency] = { centAmount, currencyCode: currency };
      }
    }
    const signature = priceBagSignature(startingPrice);
    const existing = slices.get(signature);
    const resolvedAudienceId = audienceId ?? publicAudience;
    if (existing) {
      existing.audienceIds.push(resolvedAudienceId);
    } else {
      slices.set(signature, {
        audienceIds: [resolvedAudienceId],
        price,
        startingPrice,
      });
    }
  }
  return [...slices.values()];
};

const transformProduct = (
  record: AlgoliaCommercetoolsRawProduct,
  configuration: AlgoliaCommercetoolsTransformationConfiguration
): AlgoliaProductRecord[] => {
  const availableForSale = isAvailable(record.variants);
  const availability: AlgoliaProductRecord["availability"] = availableForSale
    ? "in-stock"
    : "out-of-stock";
  const featuredImage = image(record.variants);
  const description = record.description ?? {};
  const title = record.name ?? {};
  const slug = record.slug ?? {};
  const { categories, category } = categoriesFromRecord(record);
  const currencies = ALGOLIA_CONNECTOR_CURRENCIES.filter((currency) =>
    record.variants.some((variant) => variant.prices?.[currency] !== undefined)
  );
  const variants = record.variants.map(({ attributes, id, key, sku }) => {
    const variantCore = { id };
    const variantWithAttributes =
      attributes === undefined ? variantCore : { ...variantCore, attributes };
    const variantWithKey =
      key === undefined
        ? variantWithAttributes
        : { ...variantWithAttributes, key };
    return sku === undefined ? variantWithKey : { ...variantWithKey, sku };
  });

  return priceSlices(
    record.variants,
    currencies,
    configuration.priceCustomerGroupIds
  ).map(({ audienceIds, price, startingPrice }) => {
    const objectID = audienceIds.includes(publicAudience)
      ? record.objectID
      : `${record.objectID}--${audienceIds.join("-")}`;
    const productCardCore = {
      availableForSale,
      id: record.objectID,
      slug,
      title,
    };
    const productCardWithDescription =
      Object.keys(description).length === 0
        ? productCardCore
        : { ...productCardCore, description };
    const productCardWithImage =
      featuredImage === undefined
        ? productCardWithDescription
        : { ...productCardWithDescription, featuredImage };
    const productCard =
      Object.keys(startingPrice).length === 0
        ? productCardWithImage
        : { ...productCardWithImage, startingPrice };
    const productCore = {
      availability,
      categories,
      category,
      objectID,
      priceAudienceIds: audienceIds,
      productCard,
      variants,
    };
    const productWithAttributes =
      record.attributes === undefined
        ? productCore
        : { ...productCore, attributes: record.attributes };
    return Object.keys(price).length === 0
      ? productWithAttributes
      : { ...productWithAttributes, price };
  });
};

const configuredSecret = (
  helper: AlgoliaTransformationHelper | undefined,
  name: string
): string => {
  const value = helper?.secrets?.get?.(name);
  if (value === undefined) {
    throw new Error(`Missing Algolia transformation secret ${name}`);
  }
  return value;
};

const isConfiguredObject = (
  value: unknown
): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const configuredObject = (
  value: unknown,
  label: string
): Readonly<Record<string, unknown>> => {
  if (!isConfiguredObject(value)) {
    throw new Error(`Invalid Algolia transformation ${label}`);
  }
  return value;
};

const configuredString = (value: unknown, label: string): string => {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Invalid Algolia transformation ${label}`);
  }
  return value;
};

const configuredArray = (value: unknown, label: string): readonly unknown[] => {
  if (!Array.isArray(value)) {
    throw new TypeError(`Invalid Algolia transformation ${label}`);
  }
  return value;
};

const configuredIds = (value: unknown, label: string): string[] =>
  configuredArray(value, label).map((candidate, index) =>
    configuredString(candidate, `${label}[${index}]`)
  );

const transformationConfiguration = (
  helper: AlgoliaTransformationHelper | undefined
): AlgoliaCommercetoolsTransformationConfiguration => {
  const encoded = configuredSecret(
    helper,
    ALGOLIA_COMMERCETOOLS_CONFIGURATION_SECRET_NAME
  );
  let decoded: unknown;
  try {
    decoded = JSON.parse(encoded);
  } catch (error) {
    throw new Error("Invalid Algolia transformation configuration JSON", {
      cause: error,
    });
  }
  const configuration = configuredObject(decoded, "configuration");
  if (configuration.version !== ALGOLIA_COMMERCETOOLS_CONFIGURATION_VERSION) {
    throw new Error(
      `Unsupported Algolia transformation configuration version ${String(configuration.version)}`
    );
  }
  return {
    priceCustomerGroupIds: configuredIds(
      configuration.priceCustomerGroupIds,
      "configuration.priceCustomerGroupIds"
    ),
  };
};

// Algolia requires this global function name.
export async function transform(
  record: AlgoliaCommercetoolsRawProduct,
  helper?: AlgoliaTransformationHelper
): Promise<AlgoliaProductRecord[]> {
  return transformProduct(record, transformationConfiguration(helper));
}
