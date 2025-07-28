import z from 'zod';
import { graphqlClient } from '../../../client';
import { graphql } from '../../../graphql';
import { action } from '../../utils/safe-action';
import { productCardFragment, reshapeProductCard } from '../mappers';

// TODO: This uses Product Projections Search API, but we may want to consider Product Search API.
export const getProductsCollection = action
  .metadata({ actionName: 'getProductsCollection' })
  .inputSchema(
    z.object({
      categoryId: z.string(),
      limit: z.number().default(3),
      locale: z.string(),
      currency: z.string(),
      channelId: z.string(),
    })
  )
  .action(async ({ parsedInput: { categoryId, limit, locale, currency, channelId } }) => {
    const client = graphqlClient();

    const filter = `categories.id:"${categoryId}"`;

    const query = graphql(
      `
      query productSearchCards($filter: String!, $limit: Int!, $locale: Locale!, $currency: Currency!, $channelId: String!) {
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
    const response = await client.query(query, { filter, limit, locale, currency, channelId });

    return response.data?.productProjectionSearch?.results?.map(reshapeProductCard) || [];
  });
