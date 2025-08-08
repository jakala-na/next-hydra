import { type FragmentOf, graphql, readFragment } from '../../../graphql';
import type { ProductDetails } from '../../types';

export const productPageFragment = graphql(`
  fragment ProductPage on Product {
    id
    key
    state {
      lastModifiedAt
    }
    masterData {
      current {
        name(locale: $locale)
        description(locale: $locale)
        slug(locale: $locale)
        attributesRaw {
          name
          value
          attributeDefinition {
            type {
              name
            }
            label(locale: $locale)
          }
        }
        masterVariant {
          images {
            url
            label
          }
        }
        allVariants {
          attributesRaw {
            name
            value
            attributeDefinition {
              type {
                name
              }
              label(locale: $locale)
            }
          }
          price(currency: $currency, channelId: $channelId) {
            key
            value {
              centAmount
              currencyCode
            }
          }
        }
      }
    }
  }
`);

export const reshapeProductPage = (
  _product: FragmentOf<typeof productPageFragment>
): ProductDetails => {
  const productResult = readFragment(productPageFragment, _product);

  const product = productResult.masterData?.current;
  const masterVariant = product?.masterVariant;

  return {
    id: productResult.id,
    title: product?.name || '',
    description: product?.description ?? '',
    images: masterVariant?.images
      ? masterVariant.images.map((img) => ({
          url: img.url,
          altText: img.label ?? '',
        }))
      : undefined,
    slug: product?.slug ?? undefined,
    availableForSale: true, // TODO: Make sellable if at least one variant is sellable.
    options: [], // TODO: Add options.
    variants: [], // TODO: Add variants.
    seo: {
      title: product?.name || '',
      description: product?.description ?? '',
      searchable: true,
    },
    updatedAt: productResult?.state?.lastModifiedAt ?? undefined,
  };
};
