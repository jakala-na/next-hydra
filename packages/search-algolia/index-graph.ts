import type { ContentSearchProjection } from "@repo/search/content-search-projection";
import type { SearchAudience } from "@repo/search/contract";
import { Effect, Schema } from "effect";

import { algoliaSearchAnalyticsTags } from "./analytics-tags";

export type StoreConfiguration = readonly {
  readonly storeKey: string;
  readonly locale: string;
  readonly currency: string;
  readonly isDefault?: boolean;
}[];

export const ALGOLIA_PRODUCT_REPLICA_SORTS = [
  "price-asc",
  "price-desc",
] as const;

export type AlgoliaProductReplicaSort =
  (typeof ALGOLIA_PRODUCT_REPLICA_SORTS)[number];
export type AlgoliaProductIndexSort = "relevance" | AlgoliaProductReplicaSort;

export interface AlgoliaProductReplicaDefinition {
  readonly currency: string;
  readonly indexName: string;
  readonly sort: AlgoliaProductReplicaSort;
  readonly storeKey: string;
}

export interface AlgoliaProductStorefrontDefinition {
  readonly currency: string;
  readonly locale: string;
}

export interface AlgoliaProductPrimaryDefinition {
  readonly indexName: string;
  readonly replicas: readonly AlgoliaProductReplicaDefinition[];
  readonly storeKey: string;
  readonly storefronts: readonly AlgoliaProductStorefrontDefinition[];
}

export interface AlgoliaContentIndexDefinition {
  readonly indexName: string;
  readonly locales: readonly string[];
}

export interface AlgoliaQuerySuggestionsSourceDefinition {
  readonly analyticsTags: readonly string[];
  readonly indexName: string;
}

export interface AlgoliaQuerySuggestionsDefinition {
  readonly indexName: string;
  readonly language: string;
  readonly locale: string;
  readonly sources: readonly [
    AlgoliaQuerySuggestionsSourceDefinition,
    ...AlgoliaQuerySuggestionsSourceDefinition[],
  ];
  readonly storeKey?: string;
}

export interface AlgoliaIndexGraph {
  readonly contentIndices: readonly AlgoliaContentIndexDefinition[];
  readonly prefix: string | undefined;
  readonly productPrimaries: readonly AlgoliaProductPrimaryDefinition[];
  readonly querySuggestions: readonly AlgoliaQuerySuggestionsDefinition[];
  readonly queryableIndexNames: readonly string[];
}

export class AlgoliaProvisioningInputError extends Schema.TaggedError<AlgoliaProvisioningInputError>()(
  "AlgoliaProvisioningInputError",
  {
    input: Schema.String,
    message: Schema.String,
    reason: Schema.Literals([
      "duplicate-locale",
      "duplicate-storefront",
      "empty-segment",
      "invalid-segment",
      "unsupported-locale",
    ]),
  }
) {}

const invalidInput = (
  reason: AlgoliaProvisioningInputError["reason"],
  input: string,
  message: string
) => new AlgoliaProvisioningInputError({ input, message, reason });

const segment = (value: string, label: string) => {
  const normalized = value.trim();
  if (normalized.length === 0) {
    return Effect.fail(
      invalidInput("empty-segment", value, `${label} must not be empty`)
    );
  }
  if (normalized.includes("--")) {
    return Effect.fail(
      invalidInput("invalid-segment", value, `${label} must not contain "--"`)
    );
  }
  return Effect.succeed(normalized);
};

const indexPrefix = (value: string | undefined) => {
  if (value === undefined) {
    return Effect.void.pipe(Effect.as(undefined));
  }
  const normalized = value.trim();
  if (normalized.length === 0) {
    return Effect.void.pipe(Effect.as(undefined));
  }
  if (normalized.includes("--")) {
    return Effect.fail(
      invalidInput(
        "invalid-segment",
        value,
        'Algolia index prefix must not contain "--"'
      )
    );
  }
  return Effect.succeed(normalized);
};

const algoliaIndexName = (
  prefix: string | undefined,
  ...segments: readonly string[]
): string => {
  const normalizedPrefix = prefix?.trim();
  return normalizedPrefix === undefined || normalizedPrefix.length === 0
    ? segments.join("--")
    : [normalizedPrefix, ...segments].join("--");
};

export const contentIndexName = (prefix: string | undefined): string =>
  algoliaIndexName(prefix, "content");

export const productPrimaryIndexName = (
  prefix: string | undefined,
  storeKey: string
): string => algoliaIndexName(prefix, "products", storeKey);

export const productReplicaIndexName = (
  prefix: string | undefined,
  storeKey: string,
  currency: string,
  sort: AlgoliaProductReplicaSort
): string =>
  `${productPrimaryIndexName(prefix, storeKey)}--${currency}--${sort}`;

export const querySuggestionsIndexName = (
  prefix: string | undefined,
  storeKey: string | undefined,
  locale: string
): string =>
  algoliaIndexName(
    prefix,
    "query-suggestions",
    ...(storeKey === undefined ? [] : [storeKey]),
    locale
  );

const productAudience = (audience: SearchAudience) => {
  if (audience.product === undefined) {
    throw new Error("A Product audience is required to resolve this index");
  }
  return audience.product;
};

export const createAlgoliaSearchIndices = (prefix: string | undefined) => ({
  priceAscending: (audience: SearchAudience) =>
    productReplicaIndexName(
      prefix,
      productAudience(audience).storeKey,
      productAudience(audience).currency,
      "price-asc"
    ),
  priceDescending: (audience: SearchAudience) =>
    productReplicaIndexName(
      prefix,
      productAudience(audience).storeKey,
      productAudience(audience).currency,
      "price-desc"
    ),
  products: (audience: SearchAudience) =>
    productPrimaryIndexName(prefix, productAudience(audience).storeKey),
  querySuggestions: (audience: SearchAudience) =>
    querySuggestionsIndexName(
      prefix,
      audience.product?.storeKey,
      audience.locale
    ),
});

export const createAlgoliaIndexGraph = Effect.fn("AlgoliaIndexGraph.create")(
  function* (
    prefix: string | undefined,
    locales: readonly string[],
    contentProjection: ContentSearchProjection,
    configuration: StoreConfiguration = []
  ) {
    const normalizedPrefix = yield* indexPrefix(prefix);
    const stores = new Map<string, AlgoliaProductPrimaryDefinition>();
    const querySuggestions: AlgoliaQuerySuggestionsDefinition[] = [];
    const configuredStorefronts = new Set<string>();

    for (const configuredStore of configuration) {
      const storeKey = yield* segment(configuredStore.storeKey, "Store key");
      const locale = yield* segment(configuredStore.locale, "Locale");
      const storefrontKey = `${storeKey}\u0000${locale}`;
      if (configuredStorefronts.has(storefrontKey)) {
        return yield* invalidInput(
          "duplicate-storefront",
          `${storeKey}/${locale}`,
          `Store configuration contains duplicate Store and locale ${storeKey}/${locale}`
        );
      }
      configuredStorefronts.add(storefrontKey);
    }

    const defaultEnglishStore = configuration.find(
      ({ isDefault, locale }) => isDefault && locale === "en-US"
    );

    const requestedLocales = new Set<string>();
    const selectedStorefronts: {
      readonly requestedLocale: string;
      readonly storefront: StoreConfiguration[number];
    }[] = [];
    for (const requestedLocale of locales) {
      const locale = yield* segment(requestedLocale, "Locale");
      if (requestedLocales.has(locale)) {
        return yield* invalidInput(
          "duplicate-locale",
          locale,
          `Locale ${locale} was requested more than once`
        );
      }
      requestedLocales.add(locale);
      if (configuration.length === 0) {
        querySuggestions.push({
          indexName: querySuggestionsIndexName(
            normalizedPrefix,
            undefined,
            locale
          ),
          language: locale.split("-")[0] ?? locale,
          locale,
          sources: [
            {
              analyticsTags: algoliaSearchAnalyticsTags(
                normalizedPrefix,
                locale
              ),
              indexName: contentProjection.indexName({ locale }),
            },
          ],
        });
        continue;
      }
      const matching = configuration.filter(
        (configuredStore) => configuredStore.locale === locale
      );
      let storefronts: readonly StoreConfiguration[number][] = matching;
      if (matching.length === 0 && defaultEnglishStore !== undefined) {
        storefronts = [defaultEnglishStore];
      }
      if (storefronts.length === 0) {
        return yield* invalidInput(
          "unsupported-locale",
          locale,
          `Locale ${locale} has no configured commerce Store and no default English Store is available`
        );
      }
      selectedStorefronts.push(
        ...storefronts.map((storefront) => ({
          requestedLocale: locale,
          storefront,
        }))
      );
    }

    for (const {
      requestedLocale,
      storefront: configuredStore,
    } of selectedStorefronts) {
      const storeKey = yield* segment(configuredStore.storeKey, "Store key");
      const productLocale = yield* segment(configuredStore.locale, "Locale");

      const current = stores.get(storeKey);
      const replicas = current?.replicas.some(
        ({ currency }) => currency === configuredStore.currency
      )
        ? []
        : ALGOLIA_PRODUCT_REPLICA_SORTS.map((sort) => ({
            currency: configuredStore.currency,
            indexName: productReplicaIndexName(
              normalizedPrefix,
              storeKey,
              configuredStore.currency,
              sort
            ),
            sort,
            storeKey,
          }));
      const storefronts = current?.storefronts.some(
        ({ currency, locale }) =>
          currency === configuredStore.currency && locale === productLocale
      )
        ? (current?.storefronts ?? [])
        : [
            ...(current?.storefronts ?? []),
            { currency: configuredStore.currency, locale: productLocale },
          ];
      stores.set(storeKey, {
        indexName: productPrimaryIndexName(normalizedPrefix, storeKey),
        replicas: [...(current?.replicas ?? []), ...replicas],
        storeKey,
        storefronts,
      });

      querySuggestions.push({
        indexName: querySuggestionsIndexName(
          normalizedPrefix,
          storeKey,
          requestedLocale
        ),
        language: requestedLocale.split("-")[0] ?? requestedLocale,
        locale: requestedLocale,
        sources: [
          {
            analyticsTags: algoliaSearchAnalyticsTags(
              normalizedPrefix,
              requestedLocale
            ),
            indexName: productPrimaryIndexName(normalizedPrefix, storeKey),
          },
          {
            analyticsTags: algoliaSearchAnalyticsTags(
              normalizedPrefix,
              requestedLocale
            ),
            indexName: contentProjection.indexName({ locale: requestedLocale }),
          },
        ],
        storeKey,
      });
    }

    const productPrimaries = [...stores.values()];
    const contentIndicesByName = new Map<string, string[]>();
    for (const locale of requestedLocales) {
      const indexName = contentProjection.indexName({ locale });
      const indexLocales = contentIndicesByName.get(indexName) ?? [];
      indexLocales.push(locale);
      contentIndicesByName.set(indexName, indexLocales);
    }
    const contentIndices = [...contentIndicesByName].map(
      ([indexName, indexLocales]) => ({ indexName, locales: indexLocales })
    );
    return {
      contentIndices,
      prefix: normalizedPrefix,
      productPrimaries,
      querySuggestions,
      queryableIndexNames: [
        ...productPrimaries.map(({ indexName }) => indexName),
        ...productPrimaries.flatMap(({ replicas }) =>
          replicas.map(({ indexName }) => indexName)
        ),
        ...contentIndices.map(({ indexName }) => indexName),
        ...querySuggestions.map(({ indexName }) => indexName),
      ],
    } satisfies AlgoliaIndexGraph;
  }
);
