import type {
  GetProductInput,
  GetProductsCollectionInput,
  ProductCard,
  ProductDetails,
} from '@repo/commerce-domain';

import { getCommerceAdapter } from './provider-registry';

export async function getProduct(
  input: GetProductInput
): Promise<ProductDetails> {
  const adapter = await getCommerceAdapter();
  return adapter.catalog.getProduct(input);
}

export async function getProductsCollection(
  input: GetProductsCollectionInput
): Promise<ProductCard[]> {
  const adapter = await getCommerceAdapter();
  return adapter.catalog.getProductsCollection(input);
}
