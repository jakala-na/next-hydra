import { ArticleCollectionLayout } from "@repo/design-system/components/cms/blocks/article-collection";

import type { CanvasComponentProps } from "../../generated/canvas-component-props";

type CanvasFeaturedArticlesProps = CanvasComponentProps<"featured-articles"> & {
  className?: string;
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
