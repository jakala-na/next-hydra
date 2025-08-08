import { type FragmentOf, graphql, readFragment } from '../../../graphql';
import type { ProductCard } from '../../types';

export const productCardFragment = graphql(`
  fragment ProductCard on ProductProjection {
    id
    key
    name(locale: $locale)
    description(locale: $locale)
    slug(locale: $locale)
    masterVariant {
      images {
        url
        label
      }
    }
    allVariants {
      images {
        url
      }
      price(currency: $currency, channelId: $channelId) {
        key
        value {
          centAmount
          currencyCode
        }
      }
    }
    reviewRatingStatistics {
      averageRating
      count
    }
  }
`);

export const reshapeProductCard = (
  _product: FragmentOf<typeof productCardFragment>
): ProductCard => {
  const product = readFragment(productCardFragment, _product);

  const masterVariant = product.masterVariant;

  // Collect max price and min price across variants.
  let minPriceCent: number | undefined;
  let maxPriceCent: number | undefined;
  let currencyCode: string | undefined;

  for (const v of product.allVariants) {
    const centAmount = v.price?.value.centAmount;
    if (typeof centAmount === 'number') {
      if (minPriceCent === undefined || centAmount < minPriceCent) {
        minPriceCent = centAmount;
      }
      if (maxPriceCent === undefined || centAmount > maxPriceCent) {
        maxPriceCent = centAmount;
      }
      if (!currencyCode && v.price?.value.currencyCode) {
        currencyCode = v.price.value.currencyCode;
      }
    }
  }

  return {
    id: product.id,
    title: product.name || '',
    description: product.description ?? undefined,
    featuredImage: masterVariant.images?.[0]?.url
      ? {
          url: masterVariant.images[0].url,
          altText: masterVariant.images[0].label ?? '',
        }
      : undefined,
    priceFrom: minPriceCent ? minPriceCent / 100 : 0,
    currency: currencyCode === 'USD' ? '$' : currencyCode,
    slug: product.slug ?? undefined,
  };
};
