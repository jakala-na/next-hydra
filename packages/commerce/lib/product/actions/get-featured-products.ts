import { CATEGORIES } from '@repo/commerce/constants';
import { graphqlClient } from '../../../client';
import { graphql } from '../../../graphql';
import { action } from '../../utils/safe-action';
import { productCardFragment } from '../fragments';
import { reshapeProductCard } from '../mappers';

const getCategoryIdByKey = async (key: string) => {
  'use cache';
  const client = graphqlClient();
  const catResult = await client.query(
    graphql(`
      query GetFeaturedCategory($where: String!) {
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

export const getFeaturedProducts = action.metadata({ actionName: 'getFeaturedProducts' }).action(async () => {
  const client = graphqlClient();
  const categoryId = await getCategoryIdByKey(CATEGORIES.featured);
  if (!categoryId) {
    return [];
  }
  const filter = `categories.id:"${categoryId}"`;

  const query = graphql(
    `
      query productSearchCards($filter: String!, $limit: Int!, $locale: Locale!) {
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
  const response = await client.query(query, { filter, limit: 3, locale: 'en-US' });

  return response.data?.productProjectionSearch?.results?.map(reshapeProductCard) || [];
});
