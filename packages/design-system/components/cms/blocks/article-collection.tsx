import type { ReactNode } from "react";
import { ArticleCard, type ArticleTeaser } from "../article-card";

type ArticleCollectionProps = {
  articles: ArticleTeaser[];
  description?: ReactNode;
  title: string;
};

export function ArticleCollection({
  articles,
  description,
  title,
}: ArticleCollectionProps) {
  if (articles.length === 0) {
    return null;
  }

  return (
    <section className="py-24">
      <div className="container">
        <div className="mb-12 max-w-3xl space-y-4">
          <h2 className="text-balance font-bold text-4xl tracking-tight lg:text-5xl">
            {title}
          </h2>
          {description ? (
            <div className="text-muted-foreground text-xl">{description}</div>
          ) : null}
        </div>
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {articles.map((article) => (
            <ArticleCard article={article} key={article.id} />
          ))}
        </div>
      </div>
    </section>
  );
}
