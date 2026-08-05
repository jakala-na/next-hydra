import Image from "next/image";
import type { ReactNode } from "react";
import type { ArticleImage } from "../article-card";

type ArticlePageProps = {
  body: ReactNode;
  image?: ArticleImage;
  publishedAt?: string;
  summary: string;
  title: string;
};

export function ArticlePage({
  body,
  image,
  publishedAt,
  summary,
  title,
}: ArticlePageProps) {
  return (
    <article className="py-16 lg:py-24">
      <header className="container max-w-4xl space-y-6 text-center">
        {publishedAt ? (
          <p className="font-medium text-primary text-sm">{publishedAt}</p>
        ) : null}
        <h1 className="text-balance font-bold text-5xl tracking-tight lg:text-7xl">
          {title}
        </h1>
        <p className="text-balance text-muted-foreground text-xl leading-relaxed lg:text-2xl">
          {summary}
        </p>
      </header>

      {image ? (
        <div className="container my-12 max-w-6xl">
          <div className="relative aspect-[16/9] overflow-hidden rounded-xl bg-muted">
            <Image
              alt={image.altText}
              className="object-cover"
              fill
              preload
              sizes="(min-width: 1280px) 1152px, 100vw"
              src={image.url}
            />
          </div>
        </div>
      ) : null}

      <div className="prose prose-lg container max-w-3xl">{body}</div>
    </article>
  );
}
