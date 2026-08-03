import type { Locale } from "@repo/i18n/types";
import type { CurrencyCode } from "../../domain/money";
import type { FragmentOf } from "../../graphql";
import { graphql } from "../../graphql";
import { graphqlClient } from "../client/graphql-client";
import { productCardFragment } from "./mappers/product-card";
import { productPageFragment } from "./mappers/product-page";

type ProductDiscoveryContext = {
  locale: Locale;
  currency: CurrencyCode;
  distributionChannelId: string;
  supplyChannelIds: string[];
};

const client = graphqlClient();

const GetProductBySlugQuery = graphql(
  `
    query GetProductBySlug(
      $filters: [SearchFilterInput!]
      $locale: Locale!
      $currency: Currency!
      $distributionChannelId: String!
      $supplyChannelIds: [String!]
    ) {
      productProjectionSearch(filters: $filters, limit: 1) {
        results {
          id
          ...ProductPage
        }
      }
    }
  `,
  [productPageFragment]
);

async function getProductProjectionBySlug(
  slug: string,
  ctx: ProductDiscoveryContext
): Promise<FragmentOf<typeof productPageFragment> | null> {
  const { locale, currency, distributionChannelId, supplyChannelIds } = ctx;

  const filters = [
    {
      model: {
        value: {
          path: `slug.${locale}`,
          values: [slug],
        },
      },
    },
  ];

  const response = await client.query(GetProductBySlugQuery, {
    filters,
    locale,
    currency,
    distributionChannelId,
    supplyChannelIds,
  });

  const product = response.data?.productProjectionSearch?.results?.[0] ?? null;
  return product;
}
async function getProductProjectionsCollection(
  params: {
    filter: string;
    limit: number;
  },
  ctx: ProductDiscoveryContext
) {
  const { filter, limit } = params;
  const { locale, currency, distributionChannelId, supplyChannelIds } = ctx;

  // Note: locale is embedded in the sorts expression string, as required by the API
  const query = graphql(
    `
      query productSearchCards($filter: String!, $limit: Int!, $locale: Locale!, $currency: Currency!, $distributionChannelId: String!, $supplyChannelIds: [String!]) {
        productProjectionSearch(
          filters: { string: $filter }
          sorts: ["name.${locale} ASC"]
          limit: $limit
        ) {
          results {
            id
            allVariants {
              sku
            }
            ...ProductCard
          }
        }
      }
    `,
    [productCardFragment]
  );

  const response = await client.query(query, {
    filter,
    limit,
    locale,
    currency,
    distributionChannelId,
    supplyChannelIds,
  });

  return response.data?.productProjectionSearch?.results ?? [];
}

export const productRepo = {
  getProductProjectionBySlug,
  getProductProjectionsCollection,
};
