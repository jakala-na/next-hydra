import { ArticleCollectionLayout } from "@repo/design-system/components/cms/blocks/article-collection";
import type { ReactNode } from "react";

type CanvasFeaturedArticlesProps = {
  articles?: ReactNode;
  className?: string;
  description?: string;
  title: string;
};

export default function CanvasFeaturedArticles({
  articles,
  className,
  description,
  title,
}: CanvasFeaturedArticlesProps) {
  return (
    <ArticleCollectionLayout
      className={className}
      description={description}
      title={title}
    >
      {articles}
    </ArticleCollectionLayout>
  );
}
