import { graphqlClient } from '../../client';
import { graphql } from '../../graphql';

const GetFeaturedCategoryQuery = graphql(`
  query GetFeaturedCategory($where: String!) {
    categories(where: $where, limit: 1) {
      results {
        id
      }
    }
  }
`);

const SearchFeaturedProductsQuery = graphql(`
  query SearchFeaturedProducts($filter: String!, $limit: Int!, $locale: Locale!) {
    productProjectionSearch(
      filters: { string: $filter }
      limit: $limit
      staged: false
    ) {
      results {
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
    }
  }
`);

const getFeaturedCategoryId = async () => {
  const client = graphqlClient();
  const catResult = await client.query(GetFeaturedCategoryQuery, {
    where: 'key = "featured"',
  });
  return catResult.data?.categories?.results?.[0]?.id || null;
};

export async function getFeaturedProducts() {
  const client = graphqlClient();
  const categoryId = await getFeaturedCategoryId();
  if (!categoryId) {
    return [];
  }
  const filter = `categories.id:"${categoryId}"`;
  const prodResult = await client.query(SearchFeaturedProductsQuery, {
    filter,
    limit: 3,
    locale: 'en-US',
  });
  return prodResult.data?.productProjectionSearch?.results || [];
}
