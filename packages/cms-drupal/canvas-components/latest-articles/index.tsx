import type { CanvasComponentProps } from "@repo/cms-drupal/canvas-component-props";
import { getLatestArticles } from "@repo/cms-drupal/lib/latest-articles";
import { ArchitectureBoundary } from "@repo/design-system/components/architecture/architecture-boundary";
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
      cacheProfile="hours; Drupal node_list:article revalidation"
      component="server"
      description="Queries the newest published Articles from Drupal GraphQL and maps them into the shared article-card presentation."
      layer="block"
      layerLabel="Canvas component adapter"
      name="CanvasLatestArticles"
      rendering="streamed"
      source="cms"
      sourceLabel="Drupal GraphQL"
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
