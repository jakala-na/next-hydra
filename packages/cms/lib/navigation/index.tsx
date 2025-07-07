import {
  unstable_cacheLife as cacheLife,
  unstable_cacheTag as cacheTag,
} from 'next/cache';
import { graphqlClient } from '../../client';
import { TAGS } from '../../constants';
import { graphql } from '../../graphql';
import type { NavigationItem } from '../../types';

export const getMenuQuery = graphql(`
  query getMenu($locale: String!) {
    all_navigation(locale: $locale, fallback_locale: true) {
      items {
        system {
          uid
          content_type_uid
        }
        title
        items {
          text
          linkConnection {
            edges {
              node {
                ... on Page {
                  system {
                    uid
                    content_type_uid
                  }
                  url
                }
              }
            }
          }
        }
      }
    }
  }
`);

export async function getNavigation(
  locale: string,
  livePreviewHash?: string
): Promise<NavigationItem[]> {
  'use cache';
  cacheTag(TAGS.menu);
  cacheLife('days');

  const res = await graphqlClient(livePreviewHash).query(getMenuQuery, {
    locale,
  });

  return (
    res.data?.all_navigation?.items?.[0]?.items?.map((item) => {
      const links =
        item?.linkConnection?.edges?.map((edge) => edge?.node) ?? [];
      return {
        title: item?.text ?? '',
        href: links[0]?.url ?? '',
      };
    }) || []
  );
}
