import type { ProductCard, ProductDetails } from './types';

export type GetProductInput = {
  productKey: string;
  locale: string;
  currency: string;
  channelId: string;
};

export type GetProductsCollectionInput = {
  categoryId: string;
  limit?: number;
  locale: string;
  currency: string;
  channelId: string;
};

export type CatalogAdapter = {
  getProduct: (input: GetProductInput) => Promise<ProductDetails>;
  getProductsCollection: (
    input: GetProductsCollectionInput
  ) => Promise<ProductCard[]>;
};
