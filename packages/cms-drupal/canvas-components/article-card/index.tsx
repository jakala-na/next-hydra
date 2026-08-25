import { ArticleCard } from "@repo/design-system/components/cms/article-card";
import type { ArticleTeaser } from "@repo/design-system/components/cms/article-card";
import {
  Card,
  CardContent,
  CardFooter,
} from "@repo/design-system/components/ui/card";
import { cn } from "@repo/design-system/lib/utils";
import type { Locale } from "@repo/i18n";
import { getPathname } from "@repo/i18n/navigation";
import type { ReactElement } from "react";

import type { CanvasComponentProps } from "../../generated/canvas-component-props";

const DIGITS_ONLY = /^\d+$/;
const MILLISECONDS_PER_SECOND = 1000;

export type CanvasArticleCardProps = CanvasComponentProps<"article-card"> & {
  className?: string;
  locale?: Locale;
  readMoreLabel?: string;
};

type CanvasArticleReference = NonNullable<
  CanvasComponentProps<"article-card">["article"]
>;

export function CanvasArticleCardPlaceholder({
  className,
}: Pick<CanvasArticleCardProps, "className">) {
  return (
    <article className={cn("h-full", className)}>
      <Card className="h-full overflow-hidden border-dashed py-0 shadow-none">
        <div className="flex aspect-[16/10] items-center justify-center bg-muted">
          <p className="font-medium text-muted-foreground text-sm">
            Article card
          </p>
        </div>
        <CardContent className="flex flex-1 flex-col justify-center space-y-3 p-6">
          <h3 className="text-balance font-bold text-2xl">Select an article</h3>
          <p className="text-muted-foreground leading-relaxed">
            Choose an article in the component settings to preview its content.
          </p>
        </CardContent>
        <CardFooter className="p-6 pt-0">
          <span className="font-medium text-muted-foreground">
            Article link
          </span>
        </CardFooter>
      </Card>
    </article>
  );
}

function resolveDrupalMediaUrl(source: string): string {
  try {
    return new URL(source).toString();
  } catch {
    const siteUrl = process.env.CANVAS_SITE_URL ?? process.env.DRUPAL_BASE_URL;
    return siteUrl ? new URL(source, siteUrl).toString() : source;
  }
}

function formatPublishedAt(
  value: CanvasArticleReference["created"],
  locale: Locale
) {
  if (value === null || value === undefined) {
    return;
  }

  const date =
    typeof value === "number" || DIGITS_ONLY.test(value)
      ? new Date(Number(value) * MILLISECONDS_PER_SECOND)
      : new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return;
  }

  return new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(date);
}

export function toCanvasArticleTeaser(
  article: CanvasArticleReference | null | undefined,
  locale: Locale
): ArticleTeaser | undefined {
  const title = article?.label?.trim();
  const summary = article?.fieldSummary?.trim();
  if (!(article && title && summary)) {
    return;
  }

  const path =
    article.path?.trim() ||
    (article.id === null || article.id === undefined
      ? undefined
      : `/node/${article.id}`);
  if (!path) {
    return;
  }

  const sourceImage = article.fieldImage?.fieldMediaImage;
  const image = sourceImage?.src
    ? {
        altText: sourceImage.alt ?? "",
        height: sourceImage.height ?? undefined,
        url: resolveDrupalMediaUrl(sourceImage.src),
        width: sourceImage.width ?? undefined,
      }
    : undefined;

  return {
    href: getPathname({ href: path, locale }),
    id: String(article.id ?? path),
    image,
    publishedAt: formatPublishedAt(article.created, locale),
    summary,
    title,
  };
}

export default function CanvasArticleCard({
  article,
  className,
  locale = "en-US",
  readMoreLabel,
}: CanvasArticleCardProps): ReactElement {
  if (!article) {
    return <CanvasArticleCardPlaceholder className={className} />;
  }

  const teaser = toCanvasArticleTeaser(article, locale);
  if (!teaser) {
    return <CanvasArticleCardPlaceholder className={className} />;
  }

  return (
    <ArticleCard
      article={teaser}
      className={className}
      readMoreLabel={readMoreLabel}
    />
  );
}
