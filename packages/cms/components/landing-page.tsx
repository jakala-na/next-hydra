import { hasLocale } from '@repo/i18n';
import { routing } from '@repo/i18n/routing';
import { unstable_cacheLife as cacheLife, unstable_cacheTag as cacheTag } from 'next/cache';
import { draftMode, headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { graphqlClient } from '../client';
import { graphql } from '../graphql';
import { addEditableTags } from '../lib/utils/add-editable-tags';

const ProductCardsFragment = graphql(`
    fragment ProductCards on ProductCards {
        title
        category
    }
`);

const getLocaleFromPath = (locale: string) => {
  return locale.toLowerCase();
};

const getPage = async (url: string, locale: string, livePreviewHash: string | undefined) => {
  'use cache';
  cacheLife('minutes');
  cacheTag(`page:${url}`);

  const pageQuery = graphql(
    `
      query PageQuery($url: String, $locale: String) {
        all_page(locale: $locale, fallback_locale: true, limit: 1, where:  {
           url: $url
        }) {
        items {
          title
          url
          headline
          components {
            ... on PageComponentsProductCards {
                product_cards {
                    ... ProductCards
                }
            }
          }
          system {
            uid
            content_type_uid
            locale
          }
        }
      }
      }
    `,
    [ProductCardsFragment]
  );

  const response = await graphqlClient(livePreviewHash).query(pageQuery, {
    locale,
    url,
  });

  const entry = response.data?.all_page?.items?.[0];

  if (!entry) {
    return;
  }

  return addEditableTags(entry, !!livePreviewHash);
};

export async function LandingPage(props: { url: string; locale: string }) {
  const { url, locale } = props;
  const { isEnabled: isDraftModeEnabled } = await draftMode();

  let livePreviewHash = '';
  if (isDraftModeEnabled) {
    livePreviewHash = (await headers()).get('x-live-preview') || '';
  }

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  const pageData = await getPage(url, getLocaleFromPath(locale), livePreviewHash);

  if (!pageData) {
    notFound();
  }

  return (
    <div>
      <h1 {...pageData.$.headline}>{pageData.headline}</h1>
      {/* {topComponents ? <ComponentRenderer data={topComponents} /> : null} */}
    </div>
  );
}
