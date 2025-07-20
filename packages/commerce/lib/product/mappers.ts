import type { Product } from '@repo/commerce/types';
import { type FragmentOf, readFragment } from '../../graphql';
import { productCardFragment } from './fragments';

type ProductCard = {
  id: string;
  imageUrl?: string;
  title?: string;
  description?: string;
  price?: number;
  currency?: string;
  rating?: number;
  reviewCount?: number;
  slug?: string;
};

export const reshapeProductCard = (_product: FragmentOf<typeof productCardFragment>): Product => {
  const product = readFragment(productCardFragment, _product);

  const variant = product.masterVariant;
  const priceCent = product.prices?.[0]?.value.centAmount;
  const currencyCode = variant.prices?.[0]?.value.currencyCode;

  return {
    imageUrl: variant.images?.[0]?.url,
    price: priceCent ? priceCent / 100 : 0,
    currency: currencyCode === 'USD' ? '$' : currencyCode,
    slug: product.slug,
  };
};
