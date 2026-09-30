import { PRODUCT_HIT_ATTRIBUTES } from "@repo/search/product-contract";
import { PRODUCT_DISCOVERY } from "@repo/search/product-discovery";
import type { IndexSettings } from "algoliasearch";

import { algoliaProductFieldPath } from "./connector/commercetools/generated-product";
import type {
  AlgoliaConnectorCurrency,
  AlgoliaConnectorLocale,
  AlgoliaProductFieldPath,
} from "./connector/commercetools/generated-product";
import type { AlgoliaProductReplicaSort } from "./index-graph";
import { algoliaProductFacetFields } from "./product-facet-fields";
import type { AlgoliaProductFacetFields } from "./product-facet-fields";

export type { AlgoliaProductFieldPath } from "./connector/commercetools/generated-product";
const DEFAULT_RANKING = [
  "typo",
  "geo",
  "words",
  "filters",
  "proximity",
  "attribute",
  "exact",
  "custom",
] as const;

export type AlgoliaProductIndexSettingsTarget =
  | {
      readonly storefronts: readonly AlgoliaProductStorefront[];
      readonly sort: "relevance";
    }
  | {
      readonly currency: AlgoliaConnectorCurrency;
      readonly storefronts: readonly AlgoliaProductStorefront[];
      readonly sort: AlgoliaProductReplicaSort;
    };

export interface AlgoliaProductStorefront {
  readonly currency: AlgoliaConnectorCurrency;
  readonly locale: AlgoliaConnectorLocale;
}

export type AlgoliaProductFacetFieldsForLocale = (
  locale: AlgoliaConnectorLocale,
  currency: AlgoliaConnectorCurrency
) => AlgoliaProductFacetFields;

const productRanking = (
  target: AlgoliaProductIndexSettingsTarget
): string[] => {
  if (target.sort === "relevance") {
    return [...DEFAULT_RANKING];
  }
  const price = algoliaProductFieldPath(`price.${target.currency}`);
  return [
    target.sort === "price-asc" ? `asc(${price})` : `desc(${price})`,
    ...DEFAULT_RANKING,
  ];
};

const productSearchableAttributes = (
  locales: readonly AlgoliaConnectorLocale[]
): readonly (
  | AlgoliaProductFieldPath
  | `unordered(${AlgoliaProductFieldPath})`
)[] => {
  const attributes: (
    | AlgoliaProductFieldPath
    | `unordered(${AlgoliaProductFieldPath})`
  )[] = [];
  for (const locale of locales) {
    const title = algoliaProductFieldPath(`productCard.title.${locale}`);
    const description = algoliaProductFieldPath(
      `productCard.description.${locale}`
    );
    const categoryLabel = algoliaProductFieldPath(`categories.label.${locale}`);
    attributes.push(
      title,
      `unordered(${description})`,
      `unordered(${categoryLabel})`
    );
  }
  return attributes;
};

const productAttributesForFaceting = (
  storefronts: readonly AlgoliaProductStorefront[],
  facetFieldsForLocale: AlgoliaProductFacetFieldsForLocale
): string[] => {
  const attributes = new Set<string>();
  for (const { currency, locale } of storefronts) {
    const fields = facetFieldsForLocale(locale, currency);
    for (const facet of PRODUCT_DISCOVERY.facets) {
      const field = fields[facet.id];
      attributes.add(
        facet.control === "refinement-list" &&
          "facetValueSearch" in facet &&
          facet.facetValueSearch
          ? `searchable(${field})`
          : field
      );
    }
  }
  attributes.add(`filterOnly(${algoliaProductFieldPath("priceAudienceIds")})`);
  return [...attributes];
};

export const productIndexSettings = (
  target: AlgoliaProductIndexSettingsTarget,
  facetFieldsForLocale: AlgoliaProductFacetFieldsForLocale = algoliaProductFacetFields
): IndexSettings => {
  if (target.storefronts.length === 0) {
    throw new Error(
      "Algolia Product index settings require at least one Storefront"
    );
  }
  const locales = [...new Set(target.storefronts.map(({ locale }) => locale))];
  return {
    attributesForFaceting: productAttributesForFaceting(
      target.storefronts,
      facetFieldsForLocale
    ),
    attributesToRetrieve: [...PRODUCT_HIT_ATTRIBUTES],
    ranking: productRanking(target),
    searchableAttributes: [...productSearchableAttributes(locales)],
    unretrievableAttributes: [algoliaProductFieldPath("priceAudienceIds")],
  };
};
