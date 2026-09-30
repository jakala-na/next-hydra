import type { CanvasComponentProps } from "@repo/cms-drupal/canvas-component-props";
import { getLatestArticles } from "@repo/cms-drupal/lib/latest-articles";
import { ArchitectureBoundary } from "@repo/demo-architecture/boundary";
import { ArticleCard } from "@repo/design-system/components/cms/article-card";
import {
  ArticleCollectionLayout,
  ArticleCollectionSkeleton,
} from "@repo/design-system/components/cms/blocks/article-collection";
import { getLocale, getTranslations } from "@repo/i18n";
import { Suspense } from "react";

const DEFAULT_ARTICLE_LIMIT = 3;

type CanvasLatestArticlesProps = CanvasComponentProps<"latest-articles"> & {
  className?: string;
};

async function LatestArticlesContent({ limit }: { limit: number }) {
  const locale = await getLocale();
  const [articles, t] = await Promise.all([
    getLatestArticles(limit, locale),
    getTranslations({ locale, namespace: "web.article" }),
  ]);

  return articles.map((article) => (
    <ArticleCard
      article={article}
      key={article.id}
      readMoreLabel={t("readGuide")}
    />
  ));
}

export default function CanvasLatestArticles({
  className,
  description,
  limit = DEFAULT_ARTICLE_LIMIT,
  title,
}: CanvasLatestArticlesProps) {
  return (
    <ArchitectureBoundary
      name="Latest articles"
      description="Loads the latest published Drupal articles and displays article cards. Hours profile: client cache 5m; background revalidation after 1h; expiry after 1d."
      composition="cms"
      caching="Cached · revalidate after 1h"
      cacheTags={["node_list:article"]}
      streaming
    >
      <ArticleCollectionLayout
        className={className}
        description={description}
        title={title}
      >
        <Suspense fallback={<ArticleCollectionSkeleton count={limit} />}>
          <LatestArticlesContent limit={limit} />
        </Suspense>
      </ArticleCollectionLayout>
    </ArchitectureBoundary>
  );
}
