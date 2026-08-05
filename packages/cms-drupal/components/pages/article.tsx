import type { ArticleTeaser } from "@repo/design-system/components/cms/article-card";
import { ArticlePage as ArticlePageView } from "@repo/design-system/components/cms/pages/article";
import type { Locale } from "@repo/i18n";
import { getPathname } from "@repo/i18n/navigation";
import { type FragmentOf, graphql, readFragment } from "../../graphql";
import { getNodeCacheTag } from "../../lib/cache-tags";

export const articleTeaserFragment = graphql(`
  fragment DrupalArticleTeaser on NodeArticle {
    id
    title
    summary
    path
    created {
      time
    }
    image {
      __typename
      ... on MediaImage {
        mediaImage {
          url
          width
          height
          alt
        }
      }
    }
  }
`);

export const articlePageFragment = graphql(
  `
    fragment DrupalArticlePage on NodeArticle {
      __typename
      id
      body {
        processed
      }
      ...DrupalArticleTeaser
    }
  `,
  [articleTeaserFragment]
);

function formatPublishedAt(value: unknown, locale: Locale) {
  if (typeof value !== "string") {
    return;
  }

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "long",
  }).format(new Date(value));
}

export function toArticleTeaser(
  data: FragmentOf<typeof articleTeaserFragment>,
  locale: Locale
): ArticleTeaser | undefined {
  const article = readFragment(articleTeaserFragment, data);
  if (!article.path) {
    return;
  }

  const image =
    article.image.__typename === "MediaImage"
      ? {
          altText: article.image.mediaImage.alt ?? "",
          height: article.image.mediaImage.height,
          url: article.image.mediaImage.url,
          width: article.image.mediaImage.width,
        }
      : undefined;

  return {
    href: getPathname({ href: article.path, locale }),
    id: article.id,
    image,
    publishedAt: formatPublishedAt(article.created.time, locale),
    summary: article.summary,
    title: article.title,
  };
}

type ArticlePageProps = {
  data: FragmentOf<typeof articlePageFragment>;
  locale: Locale;
};

export function ArticlePage({ data, locale }: ArticlePageProps) {
  const article = readFragment(articlePageFragment, data);
  const teaser = toArticleTeaser(article, locale);
  if (!teaser) {
    return null;
  }

  const bodyHtml =
    typeof article.body.processed === "string" ? article.body.processed : "";

  return (
    <ArticlePageView
      body={
        <div
          // biome-ignore lint/security/noDangerouslySetInnerHtml: Drupal returns filtered, processed HTML from an allowed text format.
          dangerouslySetInnerHTML={{ __html: bodyHtml }}
        />
      }
      image={teaser.image}
      publishedAt={teaser.publishedAt}
      summary={teaser.summary}
      title={teaser.title}
    />
  );
}

ArticlePage.fragment = articlePageFragment;
ArticlePage.getCacheTags = (data: ArticlePageProps["data"]) => {
  const article = readFragment(articlePageFragment, data);
  return [getNodeCacheTag(article)];
};
