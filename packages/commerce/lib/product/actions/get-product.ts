import z from 'zod';
import { graphqlClient } from '../../../client';
import { graphql } from '../../../graphql';
import { action } from '../../utils/safe-action';
import {
  productPageFragment,
  reshapeProductPage,
} from '../mappers/product-page';

export const getProduct = action
  .metadata({ actionName: 'getProduct' })
  .inputSchema(
    z.object({
      productKey: z.string(),
      locale: z.string(),
      currency: z.string(),
      channelId: z.string(),
    })
  )
  .action(
    async ({ parsedInput: { productKey, locale, currency, channelId } }) => {
      const client = graphqlClient();

      const query = graphql(
        `
      query productPage($productKey: String!, $locale: Locale!, $currency: Currency!, $channelId: String!) {
        product(
          key: $productKey
        ) {
          ...ProductPage
        }
      }
    `,
        [productPageFragment]
      );
      const response = await client.query(query, {
        productKey,
        locale,
        currency,
        channelId,
      });

      if (!response.data?.product) {
        // TODO: handle this better
        throw new Error('Product not found');
      }
      return reshapeProductPage(response.data?.product);
    }
  );
