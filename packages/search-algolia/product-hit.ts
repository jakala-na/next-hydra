import {
  decodeProductSearchHit,
  PRODUCT_HIT_ATTRIBUTES,
} from "@repo/search/contract";
import type { ProductSearchHit, SearchAudience } from "@repo/search/contract";
import { Schema } from "effect";

import {
  algoliaConnectorCurrency,
  algoliaConnectorLocale,
  algoliaProductFieldPath,
} from "./connector/commercetools/generated-product";
import type { AlgoliaConnectorLocale } from "./connector/commercetools/generated-product";
import type { AlgoliaSearchRecord } from "./provider";

const LocalizedString = Schema.Record(Schema.String, Schema.String);
const LocalizedMoney = Schema.Record(
  Schema.String,
  Schema.Struct({ centAmount: Schema.Finite, currencyCode: Schema.String })
);

const AlgoliaProductHitRecord = Schema.Struct({
  categories: Schema.Array(
    Schema.Struct({
      key: Schema.String,
      label: LocalizedString,
    })
  ),
  objectID: Schema.String,
  productCard: Schema.Struct({
    availableForSale: Schema.Boolean,
    description: Schema.optional(LocalizedString),
    featuredImage: Schema.optional(
      Schema.Struct({
        altText: Schema.optional(Schema.String),
        url: Schema.String,
      })
    ),
    id: Schema.String,
    slug: LocalizedString,
    startingPrice: Schema.optional(LocalizedMoney),
    title: LocalizedString,
  }),
});
const decodeAlgoliaProductHitRecord = Schema.decodeUnknownSync(
  AlgoliaProductHitRecord
);

const requiredLocalized = (
  values: Readonly<Record<string, string>>,
  locale: AlgoliaConnectorLocale,
  field: string
): string => {
  const value = values[locale];
  if (value === undefined || value.length === 0) {
    throw new Error(`Algolia Product ${field} is missing locale ${locale}`);
  }
  return value;
};

export const algoliaProductSearchableAttributes = (
  locale: AlgoliaConnectorLocale
) =>
  [
    algoliaProductFieldPath(`productCard.title.${locale}`),
    algoliaProductFieldPath(`productCard.description.${locale}`),
    algoliaProductFieldPath(`categories.label.${locale}`),
  ] as const;

export const toLocalizedProductSearchHit = (
  value: AlgoliaSearchRecord,
  audience: SearchAudience
): ProductSearchHit => {
  const locale = algoliaConnectorLocale(audience.locale);
  if (audience.product === undefined) {
    throw new Error("Algolia Product hit mapping requires a Product audience");
  }
  const currency = algoliaConnectorCurrency(audience.product.currency);
  const hit = decodeAlgoliaProductHitRecord(value);
  const description = hit.productCard.description?.[locale];
  const startingPrice = hit.productCard.startingPrice?.[currency];
  const productCardCore = {
    availableForSale: hit.productCard.availableForSale,
    id: hit.productCard.id,
    slug: requiredLocalized(hit.productCard.slug, locale, "slug"),
    title: requiredLocalized(hit.productCard.title, locale, "title"),
  };
  const productCardWithDescription =
    description === undefined
      ? productCardCore
      : { ...productCardCore, description };
  const productCardWithImage =
    hit.productCard.featuredImage === undefined
      ? productCardWithDescription
      : {
          ...productCardWithDescription,
          featuredImage: hit.productCard.featuredImage,
        };
  const productCard =
    startingPrice === undefined
      ? productCardWithImage
      : { ...productCardWithImage, startingPrice };
  return decodeProductSearchHit({
    categories: hit.categories.flatMap(({ key, label }) => {
      const localizedLabel = label[locale];
      return localizedLabel === undefined
        ? []
        : [{ key, label: localizedLabel }];
    }),
    objectID: hit.objectID,
    productCard,
  });
};

export const defaultAlgoliaProductHitMapping = {
  attributesToRetrieve: [...PRODUCT_HIT_ATTRIBUTES],
  restrictSearchableAttributes: (audience: SearchAudience) =>
    algoliaProductSearchableAttributes(algoliaConnectorLocale(audience.locale)),
  toProductSearchHit: toLocalizedProductSearchHit,
};
