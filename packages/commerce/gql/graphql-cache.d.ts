/* eslint-disable */
/* prettier-ignore */
import type { $tada, TadaDocumentNode } from 'gql.tada';

declare module 'gql.tada' {
  interface setupCache {
    '\n    fragment ProductCard on ProductProjection {\n        id\n        key\n        name(locale: $locale)\n        description(locale: $locale)\n        slug(locale: $locale)\n        masterVariant {\n          images {\n            url\n          }\n          prices {\n            key\n            value {\n              centAmount\n              currencyCode\n            }\n          }\n        }\n        reviewRatingStatistics {\n          averageRating\n          count\n        }\n    }': TadaDocumentNode<
      {
        id: string;
        key: string | null;
        name: string | null;
        description: string | null;
        slug: string | null;
        masterVariant: {
          images: { url: string }[];
          prices:
            | {
                key: string | null;
                value:
                  | { __typename?: 'HighPrecisionMoney' | undefined; centAmount: number; currencyCode: string }
                  | { __typename?: 'Money' | undefined; centAmount: number; currencyCode: string };
              }[]
            | null;
        };
        reviewRatingStatistics: { averageRating: number; count: number } | null;
      },
      {},
      { fragment: 'ProductCard'; on: 'ProductProjection'; masked: true }
    >;
    '\n      query GetFeaturedCategory($where: String!) {\n        categories(where: $where, limit: 1) {\n          results {\n            id\n          }\n        }\n      }\n    ': TadaDocumentNode<
      { categories: { results: { id: string }[] } },
      { where: string },
      void
    >;
    '\n      query productSearchCards($filter: String!, $limit: Int!, $locale: Locale!) {\n        productProjectionSearch(\n          filters: { string: $filter }\n          limit: $limit\n        ) {\n          results {\n            ...ProductCard\n          }\n        }\n      }\n    ': TadaDocumentNode<
      { productProjectionSearch: { results: { [$tada.fragmentRefs]: { ProductCard: 'ProductProjection' } }[] } },
      { locale: unknown; limit: number; filter: string },
      void
    >;
    '\n  mutation AddLineItemToCart($cartId: String!, $version: Long!, $lineItem: AddCartLineItem!) {\n    updateCart(id: $cartId, version: $version, actions: [{ addLineItem: $lineItem }]) {\n      id\n      version\n      lineItems {\n        id\n        key\n        productId\n        name(locale: "en")\n        quantity\n        price {\n          value {\n            currencyCode\n            centAmount\n          }\n        }\n        totalPrice {\n          currencyCode\n          centAmount\n        }\n      }\n      totalPrice {\n        currencyCode\n        centAmount\n      }\n    }\n  }\n': TadaDocumentNode<
      {
        updateCart: {
          id: string;
          version: number;
          lineItems: {
            id: string;
            key: string | null;
            productId: string;
            name: string | null;
            quantity: number;
            price: {
              value:
                | { __typename?: 'HighPrecisionMoney' | undefined; currencyCode: string; centAmount: number }
                | { __typename?: 'Money' | undefined; currencyCode: string; centAmount: number };
            };
            totalPrice: { currencyCode: string; centAmount: number } | null;
          }[];
          totalPrice: { currencyCode: string; centAmount: number };
        } | null;
      },
      {
        lineItem: {
          inventoryMode?: 'None' | 'ReserveOnCart' | 'ReserveOnOrder' | 'TrackOnly' | null | undefined;
          perMethodExternalTaxRate?:
            | {
                taxRate?:
                  | {
                      includedInPrice?: boolean | null | undefined;
                      subRates?: { amount: number; name: string }[] | null | undefined;
                      state?: string | null | undefined;
                      country: unknown;
                      amount: number;
                      name: string;
                    }
                  | null
                  | undefined;
                shippingMethodKey: string;
              }[]
            | null
            | undefined;
          externalTotalPrice?:
            | {
                totalPrice: { centAmount: number; currencyCode: string };
                price: {
                  highPrecision?:
                    | {
                        centAmount?: number | null | undefined;
                        fractionDigits: number;
                        preciseAmount: number;
                        currencyCode: string;
                      }
                    | null
                    | undefined;
                  centPrecision?: { centAmount: number; currencyCode: string } | null | undefined;
                };
              }
            | null
            | undefined;
          externalPrice?:
            | {
                highPrecision?:
                  | {
                      centAmount?: number | null | undefined;
                      fractionDigits: number;
                      preciseAmount: number;
                      currencyCode: string;
                    }
                  | null
                  | undefined;
                centPrecision?: { centAmount: number; currencyCode: string } | null | undefined;
              }
            | null
            | undefined;
          externalTaxRate?:
            | {
                includedInPrice?: boolean | null | undefined;
                subRates?: { amount: number; name: string }[] | null | undefined;
                state?: string | null | undefined;
                country: unknown;
                amount: number;
                name: string;
              }
            | null
            | undefined;
          recurrenceInfo?:
            | {
                priceSelectionMode: 'Dynamic' | 'Fixed';
                expiresAt?: unknown;
                recurrencePolicy: {
                  key?: string | null | undefined;
                  id?: string | null | undefined;
                  typeId?: string | null | undefined;
                };
              }
            | null
            | undefined;
          addedAt?: unknown;
          shippingDetails?:
            | {
                itemShippingAddressTargets?: { quantity: number; addressKey: string }[] | null | undefined;
                shippingTargets?: { quantity: number; shippingMethodKey: string }[] | null | undefined;
                targets?:
                  | { shippingMethodKey?: string | null | undefined; quantity: number; addressKey: string }[]
                  | null
                  | undefined;
              }
            | null
            | undefined;
          custom?:
            | {
                fields?: { value: string; name: string }[] | null | undefined;
                type?:
                  | {
                      key?: string | null | undefined;
                      id?: string | null | undefined;
                      typeId?: string | null | undefined;
                    }
                  | null
                  | undefined;
                typeKey?: string | null | undefined;
                typeId?: string | null | undefined;
              }
            | null
            | undefined;
          distributionChannel?:
            | { key?: string | null | undefined; id?: string | null | undefined; typeId?: string | null | undefined }
            | null
            | undefined;
          supplyChannel?:
            | { key?: string | null | undefined; id?: string | null | undefined; typeId?: string | null | undefined }
            | null
            | undefined;
          variantId?: number | null | undefined;
          quantity?: number | null | undefined;
          sku?: string | null | undefined;
          productId?: string | null | undefined;
          key?: string | null | undefined;
        };
        version: number;
        cartId: string;
      },
      void
    >;
  }
}
