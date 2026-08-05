import {
  Card,
  CardContent,
  CardFooter,
} from "@repo/design-system/components/ui/card";
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
  href: string;
  id: string;
  image?: ArticleImage;
  publishedAt?: string;
  summary: string;
  title: string;
};

export function ArticleCard({ article }: { article: ArticleTeaser }) {
  return (
    <article className="h-full">
      <Card className="group h-full overflow-hidden py-0 transition-all duration-300 hover:shadow-lg">
        {article.image ? (
          <div className="relative aspect-[16/10] overflow-hidden bg-muted">
            <Image
              alt={article.image.altText}
              className="object-cover transition-transform duration-300 group-hover:scale-105"
              fill
              sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
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
        <CardFooter className="p-6 pt-0">
          <Link
            className="inline-flex items-center gap-2 font-medium text-primary"
            href={article.href as Route}
          >
            Read guide
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </CardFooter>
      </Card>
    </article>
  );
}
