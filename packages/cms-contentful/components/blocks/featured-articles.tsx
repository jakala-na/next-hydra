import { ArticleCollection } from "@repo/design-system/components/cms/blocks/article-collection";
import type { Locale } from "@repo/i18n";
import { getTranslations } from "@repo/i18n";

import type { ContentfulFeaturedArticles } from "../../content";
import { toContentfulArticleTeaser } from "../../lib/content";

type FeaturedArticlesProps = {
  readonly data: ContentfulFeaturedArticles;
  readonly locale: Locale;
};

export async function FeaturedArticles({
  data,
  locale,
}: FeaturedArticlesProps) {
  const t = await getTranslations({ locale, namespace: "web.article" });
  const articles = data.articlesCollection.items.flatMap((article) =>
    article ? [toContentfulArticleTeaser(article, locale)] : []
  );

  return (
    <ArticleCollection
      articles={articles}
      description={data.description ?? undefined}
      readMoreLabel={t("readGuide")}
      title={data.heading}
    />
  );
}
