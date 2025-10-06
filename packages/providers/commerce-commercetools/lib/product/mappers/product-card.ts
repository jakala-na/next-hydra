import type { ProductCard } from '@repo/commerce-domain';
import { type FragmentOf, graphql, readFragment } from '../../../graphql';

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

type PriceSummary = {
  minPriceCent?: number;
  maxPriceCent?: number;
  currencyCode?: string;
};

function summarizeVariantPricing(
  variants: FragmentOf<typeof productCardFragment>['allVariants']
): PriceSummary {
  return variants.reduce<PriceSummary>((summary, variant) => {
    const centAmount = variant.price?.value.centAmount;

    if (typeof centAmount === 'number') {
      summary.minPriceCent = Math.min(
        summary.minPriceCent ?? centAmount,
        centAmount
      );
      summary.maxPriceCent = Math.max(
        summary.maxPriceCent ?? centAmount,
        centAmount
      );
      if (!summary.currencyCode && variant.price?.value.currencyCode) {
        summary.currencyCode = variant.price.value.currencyCode;
      }
    }

    return summary;
  }, {});
}

export const reshapeProductCard = (
  _product: FragmentOf<typeof productCardFragment>
): ProductCard => {
  const product = readFragment(productCardFragment, _product);

  const masterVariant = product.masterVariant;
  const { currencyCode, minPriceCent } = summarizeVariantPricing(
    product.allVariants
  );

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
