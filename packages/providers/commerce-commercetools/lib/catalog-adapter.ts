import type {
  CatalogAdapter,
  GetProductInput,
  GetProductsCollectionInput,
  ProductCard,
} from '@repo/commerce-domain';

import { graphqlClient } from '../client';
import { graphql } from '../graphql';
import {
  productCardFragment,
  reshapeProductCard,
} from './product/mappers/product-card';
import {
  productPageFragment,
  reshapeProductPage,
} from './product/mappers/product-page';

function buildProductsCollectionQuery() {
  return graphql(
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
}

function buildProductQuery() {
  return graphql(
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
}

export function createCatalogAdapter(): CatalogAdapter {
  const client = graphqlClient();
  const productQuery = buildProductQuery();
  const productsCollectionQuery = buildProductsCollectionQuery();

  return {
    async getProduct({
      productKey,
      locale,
      currency,
      channelId,
    }: GetProductInput) {
      const response = await client.query(productQuery, {
        productKey,
        locale,
        currency,
        channelId,
      });

      const product = response.data?.product;
      if (!product) {
        throw new Error('Product not found');
      }

      return reshapeProductPage(product);
    },
    async getProductsCollection({
      categoryId,
      limit = 3,
      locale,
      currency,
      channelId,
    }: GetProductsCollectionInput): Promise<ProductCard[]> {
      const response = await client.query(productsCollectionQuery, {
        filter: `categories.id:"${categoryId}"`,
        limit,
        locale,
        currency,
        channelId,
      });

      return (
        response.data?.productProjectionSearch?.results?.map(
          reshapeProductCard
        ) ?? []
      );
    },
  };
}
