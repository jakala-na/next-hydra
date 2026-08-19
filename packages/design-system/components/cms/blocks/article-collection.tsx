import { cn } from "@repo/design-system/lib/utils";
import type { ReactNode } from "react";

import { Card, CardContent, CardFooter } from "../../ui/card";
import { Skeleton } from "../../ui/skeleton";
import { ArticleCard } from "../article-card";
import type { ArticleTeaser } from "../article-card";

type ArticleCollectionProps = {
  articles: ArticleTeaser[];
  className?: string;
  description?: ReactNode;
  readMoreLabel?: string;
  title: string;
};

export function ArticleCollection({
  articles,
  className,
  description,
  readMoreLabel,
  title,
}: ArticleCollectionProps) {
  if (articles.length === 0) {
    return null;
  }

  return (
    <ArticleCollectionLayout
      className={className}
      description={description}
      title={title}
    >
      {articles.map((article) => (
        <ArticleCard
          article={article}
          key={article.id}
          readMoreLabel={readMoreLabel}
        />
      ))}
    </ArticleCollectionLayout>
  );
}

type ArticleCollectionLayoutProps = {
  children?: ReactNode;
  className?: string;
  description?: ReactNode;
  title: string;
};

export function ArticleCollectionLayout({
  children,
  className,
  description,
  title,
}: ArticleCollectionLayoutProps) {
  return (
    <section className={cn("py-24", className)}>
      <div className="container">
        <div className="mb-12 max-w-3xl space-y-4">
          <h2 className="text-balance font-bold text-4xl tracking-tight lg:text-5xl">
            {title}
          </h2>
          {description ? (
            <div className="text-muted-foreground text-xl">{description}</div>
          ) : null}
        </div>
        <div className="grid min-h-24 gap-8 md:grid-cols-2 lg:grid-cols-3">
          {children}
        </div>
      </div>
    </section>
  );
}

type ArticleCollectionSkeletonProps = {
  count?: number;
};

const ARTICLE_SKELETON_IDS = [
  "article-skeleton-1",
  "article-skeleton-2",
  "article-skeleton-3",
  "article-skeleton-4",
  "article-skeleton-5",
  "article-skeleton-6",
  "article-skeleton-7",
  "article-skeleton-8",
  "article-skeleton-9",
] as const;

export function ArticleCollectionSkeleton({
  count = 3,
}: ArticleCollectionSkeletonProps) {
  return ARTICLE_SKELETON_IDS.slice(0, count).map((id) => (
    <article aria-hidden="true" className="h-full" key={id}>
      <Card className="h-full overflow-hidden py-0 shadow-none">
        <Skeleton className="aspect-[16/10] w-full rounded-none" />
        <CardContent className="flex-1 space-y-4 p-6">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-8 w-4/5" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </CardContent>
        <CardFooter className="p-6 pt-0">
          <Skeleton className="h-5 w-28" />
        </CardFooter>
      </Card>
    </article>
  ));
}
