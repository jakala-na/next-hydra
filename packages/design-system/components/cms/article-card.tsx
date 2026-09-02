import {
  Card,
  CardContent,
  CardFooter,
} from "@repo/design-system/components/ui/card";
import { cn } from "@repo/design-system/lib/utils";
import { ArrowRight } from "lucide-react";
import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";

export type ArticleImage = {
  altText: string;
  height?: number;
  url: string;
  width?: number;
};

export type ArticleTeaser = {
  href: Route | URL;
  id: string;
  image?: ArticleImage;
  publishedAt?: string;
  summary: string;
  title: string;
};

type ArticleCardProps = {
  article: ArticleTeaser;
  className?: string;
  layout?: "grid" | "row";
  readMoreLabel?: string;
};

export function ArticleCard({
  article,
  className,
  layout = "grid",
  readMoreLabel = "Read guide",
}: ArticleCardProps) {
  return (
    <article className={cn("h-full", className)}>
      <Card
        className={cn(
          "group h-full overflow-hidden py-0 transition-all duration-300 hover:shadow-lg",
          layout === "row" &&
            article.image !== undefined &&
            "sm:grid sm:grid-cols-[14rem_minmax(0,1fr)] sm:grid-rows-[1fr_auto]",
          layout === "row" &&
            article.image === undefined &&
            "sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
        )}
      >
        {article.image ? (
          <div
            className={cn(
              "relative aspect-[16/10] overflow-hidden bg-muted",
              layout === "row" &&
                "sm:row-span-2 sm:aspect-auto sm:h-full sm:min-h-56"
            )}
          >
            <Image
              alt={article.image.altText}
              className="object-cover transition-transform duration-300 group-hover:scale-105"
              fill
              sizes={
                layout === "row"
                  ? "(min-width: 640px) 14rem, 100vw"
                  : "(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
              }
              src={article.image.url}
            />
          </div>
        ) : null}
        <CardContent className="flex-1 space-y-4 p-6">
          {article.publishedAt ? (
            <p className="font-medium text-primary text-sm">
              {article.publishedAt}
            </p>
          ) : null}
          <h3 className="text-balance font-bold text-2xl">{article.title}</h3>
          <p className="text-muted-foreground leading-relaxed">
            {article.summary}
          </p>
        </CardContent>
        <CardFooter className={cn("p-6 pt-0", layout === "row" && "sm:pt-6")}>
          <Link
            className="inline-flex items-center gap-2 font-medium text-primary"
            href={article.href}
          >
            {readMoreLabel}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </CardFooter>
      </Card>
    </article>
  );
}

export type { ArticleCardProps };
