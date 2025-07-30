import { type FragmentOf, graphql, readFragment } from '../../graphql';

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
    }`);

type ProductCard = {
  id: string;
  imageUrl?: string;
  title: string;
  description?: string;
  priceFrom?: number;
  currency?: string;
  rating?: number;
  reviewCount?: number;
  slug?: string;
};

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
    imageUrl: masterVariant.images?.[0]?.url,
    priceFrom: minPriceCent ? minPriceCent / 100 : 0,
    currency: currencyCode === 'USD' ? '$' : currencyCode,
    slug: product.slug ?? undefined,
  };
};
