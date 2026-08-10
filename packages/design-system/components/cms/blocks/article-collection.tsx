import { cn } from "@repo/design-system/lib/utils";
import type { ReactNode } from "react";
import { ArticleCard, type ArticleTeaser } from "../article-card";

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
