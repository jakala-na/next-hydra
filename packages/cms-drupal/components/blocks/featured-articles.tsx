import { ArticleCollection } from "@repo/design-system/components/cms/blocks/article-collection";
import { getTranslations, type Locale } from "@repo/i18n";
import { type FragmentOf, graphql, readFragment } from "../../graphql";
import { getNodeCacheTag } from "../../lib/cache-tags";
import { articleTeaserFragment, toArticleTeaser } from "../pages/article";

export const featuredArticlesFragment = graphql(
  `
    fragment DrupalFeaturedArticles on ParagraphFeaturedArticle {
      id
      heading
      description
      articles {
        __typename
        ... on NodeArticle {
          id
          ...DrupalArticleTeaser
        }
      }
    }
  `,
  [articleTeaserFragment]
);

type FeaturedArticlesProps = {
  data: FragmentOf<typeof featuredArticlesFragment>;
  locale: Locale;
};

export async function FeaturedArticles({
  data,
  locale,
}: FeaturedArticlesProps) {
  const block = readFragment(featuredArticlesFragment, data);
  const t = await getTranslations({ locale, namespace: "web.article" });
  const articles = block.articles.flatMap((article) => {
    if (article.__typename !== "NodeArticle") {
      return [];
    }

    const teaser = toArticleTeaser(article, locale);
    return teaser ? [teaser] : [];
  });

  return (
    <ArticleCollection
      articles={articles}
      description={block.description ?? undefined}
      readMoreLabel={t("readGuide")}
      title={block.heading}
    />
  );
}

FeaturedArticles.fragment = featuredArticlesFragment;
FeaturedArticles.getCacheTags = (data: FeaturedArticlesProps["data"]) => {
  const block = readFragment(featuredArticlesFragment, data);
  return block.articles.flatMap((article) =>
    article.__typename === "NodeArticle" ? [getNodeCacheTag(article)] : []
  );
};
