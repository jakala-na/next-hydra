import type { StoreKey } from "@repo/commerce/store";
import { Cache, Data, Duration, Effect, Exit, Layer } from "effect";

import { CommercetoolsGraphQLClient } from "../client/graphql-client";
import { CommercetoolsConfig } from "../config/config";
import { graphql, readFragment } from "../graphql";
import type { FragmentOf, ResultOf } from "../graphql";
import {
  CommercetoolsProductDiscoveryClient,
  CommercetoolsProductRequestFailure,
} from "./client";
import type {
  CommercetoolsProductContext,
  CommercetoolsProductProjection,
  CommercetoolsProductVariant,
  FindCommercetoolsProductBySlugInput,
  ListCommercetoolsProductProjectionsInput,
  ResolveCommercetoolsProductContextInput,
} from "./client";

const PRODUCT_SEARCH_PAGE_LIMIT = 100;
const PRODUCT_SEARCH_RESULT_LIMIT = 10_000;

const productDataFragment = graphql(`
  fragment ProductDataFields on ProductData {
    name(locale: $locale)
    description(locale: $locale)
    slug(locale: $locale)
    categories {
      id
      name(locale: $locale)
      slug(locale: $locale)
    }
    masterVariant {
      images {
        url
        label
      }
    }
    allVariants(onlyMatching: true) {
      id
      sku
      images {
        url
        label
      }
      attributesRaw {
        name
        value
      }
      price(
        currency: $currency
        channelId: $distributionChannelId
        customerGroupId: $customerGroupId
      ) {
        value {
          centAmount
          currencyCode
        }
        discounted {
          value {
            centAmount
            currencyCode
          }
        }
      }
      availability {
        channels(includeChannelIds: $supplyChannelIds) {
          results {
            availability {
              availableQuantity
            }
          }
        }
      }
    }
  }
`);

const productFragment = graphql(
  `
    fragment ProductFields on Product {
      id
      productType {
        key
      }
      masterData {
        current {
          ...ProductDataFields
        }
      }
    }
  `,
  [productDataFragment]
);

const findProductBySlugQuery = graphql(
  `
    query ProviderProductBySlug(
      $query: SearchQueryInput!
      $locale: Locale!
      $currency: Currency!
      $distributionChannelId: String!
      $supplyChannelIds: [String!]
      $customerGroupId: String
    ) {
      productsSearch(query: $query, limit: 1, markMatchingVariants: true) {
        results {
          product {
            ...ProductFields
          }
        }
      }
    }
  `,
  [productFragment]
);

const listProductsQuery = graphql(
  `
    query ProviderProductCards(
      $query: SearchQueryInput!
      $sort: [SearchSortingInput!]!
      $limit: Int!
      $offset: Int!
      $locale: Locale!
      $currency: Currency!
      $distributionChannelId: String!
      $supplyChannelIds: [String!]
      $customerGroupId: String
    ) {
      productsSearch(
        query: $query
        markMatchingVariants: true
        sort: $sort
        limit: $limit
        offset: $offset
      ) {
        total
        results {
          product {
            ...ProductFields
          }
        }
      }
    }
  `,
  [productFragment]
);

const resolveStoreQuery = graphql(`
  query ResolveProviderProductStore($storeKey: String!) {
    store(key: $storeKey) {
      id
      distributionChannels {
        id
        key
      }
      supplyChannels {
        id
        key
      }
    }
  }
`);

const resolveCustomerGroupQuery = graphql(`
  query ResolveProviderProductCustomerGroup($customerId: String!) {
    customer(id: $customerId) {
      customerGroup {
        id
        key
      }
    }
  }
`);

const toVariant = (
  variant: ResultOf<typeof productDataFragment>["allVariants"][number]
): CommercetoolsProductVariant => ({
  attributesRaw: variant.attributesRaw,
  availability:
    variant.availability === null
      ? null
      : {
          channels: variant.availability.channels.results.map(
            ({ availability }) => ({
              availableQuantity: availability.availableQuantity,
            })
          ),
        },
  id: variant.id,
  images: variant.images,
  price:
    variant.price === null
      ? null
      : {
          discounted:
            variant.price.discounted === null
              ? null
              : { value: variant.price.discounted.value },
          value: variant.price.value,
        },
  sku: variant.sku,
});

const toProjection = (
  data: FragmentOf<typeof productFragment>
): Effect.Effect<
  CommercetoolsProductProjection,
  CommercetoolsProductRequestFailure
> =>
  Effect.gen(function* () {
    const product = readFragment(productFragment, data);
    if (product.masterData.current === null) {
      return yield* new CommercetoolsProductRequestFailure({
        message: `Commercetools Product ${product.id} has no current data`,
      });
    }
    const current = readFragment(
      productDataFragment,
      product.masterData.current
    );
    return {
      allVariants: current.allVariants.map(toVariant),
      categories: current.categories.map(({ id, name, slug }) => ({
        id,
        name,
        slug,
      })),
      description: current.description,
      id: product.id,
      masterVariant: current.masterVariant,
      name: current.name,
      productType: product.productType,
      slug: current.slug,
    };
  });

const requestProductData = <A extends { readonly error?: unknown }>(
  request: () => PromiseLike<A>
) =>
  Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      catch: (cause) =>
        new CommercetoolsProductRequestFailure({
          cause,
          message: "Commercetools Product request failed",
        }),
      try: request,
    });
    if (response.error !== undefined) {
      return yield* new CommercetoolsProductRequestFailure({
        cause: response.error,
        message: "Commercetools Product GraphQL request failed",
      });
    }
    return response;
  });

const productQueryVariables = (
  input:
    | FindCommercetoolsProductBySlugInput
    | ListCommercetoolsProductProjectionsInput
) => ({
  currency: input.currency,
  customerGroupId: input.context.customerGroupId,
  distributionChannelId: input.context.distributionChannelId,
  locale: input.locale,
  supplyChannelIds: [...input.context.supplyChannelIds],
});

class ProductStoreCacheKey extends Data.Class<{
  readonly projectKey: string;
  readonly region: string;
  readonly storeKey: StoreKey;
}> {}

const readProductStore = Effect.fn(
  "CommercetoolsProductDiscoveryClient.readStore"
)(function* ({ storeKey }: ProductStoreCacheKey) {
  const client = yield* CommercetoolsGraphQLClient;
  const response = yield* requestProductData(() =>
    client.query(resolveStoreQuery, { storeKey })
  );
  const store = response.data?.store;
  if (store === undefined || store === null) {
    return yield* new CommercetoolsProductRequestFailure({
      message: `Commercetools Store ${storeKey} was not found`,
    });
  }
  const [distributionChannel] = store.distributionChannels;
  if (distributionChannel === undefined) {
    return yield* new CommercetoolsProductRequestFailure({
      message: `Commercetools Store ${storeKey} has no distribution channel`,
    });
  }
  if (distributionChannel.key === null) {
    return yield* new CommercetoolsProductRequestFailure({
      message: `Commercetools Store ${storeKey} has a distribution channel without a key`,
    });
  }
  const supplyChannelKeys: string[] = [];
  for (const channel of store.supplyChannels) {
    if (channel.key === null) {
      return yield* new CommercetoolsProductRequestFailure({
        message: `Commercetools Store ${storeKey} has a supply channel without a key`,
      });
    }
    supplyChannelKeys.push(channel.key);
  }
  return {
    distributionChannelId: distributionChannel.id,
    distributionChannelKey: distributionChannel.key,
    storeId: store.id,
    supplyChannelIds: store.supplyChannels.map(({ id }) => id),
    supplyChannelKeys,
  };
});

// Request Layers are rebuilt for each buyer; Store configuration is shared across requests.
const productStores = Effect.runSync(
  Cache.makeWith(readProductStore, {
    capacity: 100,
    requireServicesAt: "lookup",
    timeToLive: (exit) => (Exit.isSuccess(exit) ? "1 hour" : Duration.zero),
  })
);

const storeVariantFilter = (context: CommercetoolsProductContext) => ({
  exact: { field: "variants.stores", value: context.storeId },
});

export const commercetoolsProductDiscoveryClientLayer = Layer.effect(
  CommercetoolsProductDiscoveryClient,
  Effect.gen(function* () {
    const client = yield* CommercetoolsGraphQLClient;
    const config = yield* CommercetoolsConfig;

    return CommercetoolsProductDiscoveryClient.of({
      findProductBySlug: Effect.fn(
        "CommercetoolsProductDiscoveryClient.findProductBySlug"
      )(function* (input) {
        const response = yield* requestProductData(() =>
          client.query(findProductBySlugQuery, {
            query: {
              filter: [
                storeVariantFilter(input.context),
                {
                  exact: {
                    caseInsensitive: false,
                    field: "slug",
                    language: input.locale,
                    value: input.slug,
                  },
                },
              ],
            },
            ...productQueryVariables(input),
          })
        );
        const page = response.data?.productsSearch;
        if (page === undefined || page === null) {
          return yield* new CommercetoolsProductRequestFailure({
            message: "Commercetools Product Search response was missing data",
          });
        }
        const [hit] = page.results;
        if (hit === undefined) {
          return null;
        }
        return yield* toProjection(hit.product);
      }),
      listProductProjections: Effect.fn(
        "CommercetoolsProductDiscoveryClient.listProductProjections"
      )(function* (input) {
        if (input.limit > PRODUCT_SEARCH_RESULT_LIMIT) {
          return yield* new CommercetoolsProductRequestFailure({
            message:
              "Commercetools Product Search can retrieve at most 10000 results",
          });
        }
        const searchQuery =
          input.categoryId === undefined
            ? storeVariantFilter(input.context)
            : {
                filter: [
                  storeVariantFilter(input.context),
                  { exact: { field: "categories", value: input.categoryId } },
                ],
              };
        const products: CommercetoolsProductProjection[] = [];
        let offset = 0;
        let total = input.limit;

        while (offset < Math.min(input.limit, total)) {
          const pageOffset = offset;
          const response = yield* requestProductData(() =>
            client.query(listProductsQuery, {
              ...productQueryVariables(input),
              limit: Math.min(
                PRODUCT_SEARCH_PAGE_LIMIT,
                input.limit - pageOffset
              ),
              offset: pageOffset,
              query: searchQuery,
              sort: [
                { field: "name", language: input.locale, order: "asc" },
                { field: "id", order: "asc" },
              ],
            })
          );
          const page = response.data?.productsSearch;
          if (page === undefined || page === null) {
            return yield* new CommercetoolsProductRequestFailure({
              message: "Commercetools Product Search response was missing data",
            });
          }
          const { results, total: pageTotal } = page;
          if (results.length === 0 && offset < pageTotal) {
            return yield* new CommercetoolsProductRequestFailure({
              message:
                "Commercetools Product Search pagination made no progress",
            });
          }
          const pageProducts = yield* Effect.forEach(toProjection)(
            results.map(({ product }) => product)
          );
          products.push(...pageProducts);
          offset += results.length;
          total = pageTotal;
        }
        return products;
      }),
      resolveProductContext: Effect.fn(
        "CommercetoolsProductDiscoveryClient.resolveProductContext"
      )(function* (input: ResolveCommercetoolsProductContextInput) {
        const storeContext = yield* Cache.get(
          productStores,
          new ProductStoreCacheKey({
            projectKey: config.projectKey,
            region: config.region,
            storeKey: input.storeKey,
          })
        ).pipe(Effect.provideService(CommercetoolsGraphQLClient, client));
        let customerGroupId: string | undefined;
        const { customerId } = input;
        if (customerId !== undefined) {
          const customerResponse = yield* requestProductData(() =>
            client.query(resolveCustomerGroupQuery, {
              customerId,
            })
          );
          customerGroupId = customerResponse.data?.customer?.customerGroup?.id;
        }
        return customerGroupId === undefined
          ? storeContext
          : { ...storeContext, customerGroupId };
      }),
    });
  })
);
