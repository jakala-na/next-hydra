import z from 'zod';
import { graphqlClient } from '../../../client';
import { graphql } from '../../../graphql';
import { action } from '../../utils/safe-action';
import { productCardFragment, reshapeProductCard } from '../mappers';

const getCategoryIdByKey = async (key: string) => {
  'use cache';
  const client = graphqlClient();
  const catResult = await client.query(
    graphql(`
      query GetCategoryIDByKey($where: String!) {
        categories(where: $where, limit: 1) {
          results {
            id
          }
        }
      }
    `),
    { where: `key = "${key}"` }
  );
  return catResult.data?.categories?.results?.[0]?.id || null;
};

export const getProductsCollection = action
  .metadata({ actionName: 'getProductsCollection' })
  .inputSchema(
    z.object({ categoryKey: z.string(), limit: z.number().default(3), locale: z.string(), currency: z.string() })
  )
  .action(async ({ parsedInput: { categoryKey, limit, locale, currency } }) => {
    const client = graphqlClient();
    const categoryId = await getCategoryIdByKey(categoryKey);
    if (!categoryId) {
      return [];
    }
    const filter = `categories.id:"${categoryId}"`;

    const query = graphql(
      `
      query productSearchCards($filter: String!, $limit: Int!, $locale: Locale!, $currency: Currency!) {
        productProjectionSearch(
          filters: { string: $filter }
          limit: $limit
        ) {
          results {
            ...ProductCard
          }
        }
      }
    `,
      [productCardFragment]
    );
    const response = await client.query(query, { filter, limit, locale, currency });

    return response.data?.productProjectionSearch?.results?.map(reshapeProductCard) || [];
  });
