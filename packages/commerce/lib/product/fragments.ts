import { graphql } from '../../graphql';

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
          prices {
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
