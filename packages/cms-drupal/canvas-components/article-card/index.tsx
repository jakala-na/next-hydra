import {
  ArticleCard,
  type ArticleTeaser,
} from "@repo/design-system/components/cms/article-card";
import { getLocale, getTranslations, type Locale } from "@repo/i18n";
import { getPathname } from "@repo/i18n/navigation";

const DIGITS_ONLY = /^\d+$/;
const MILLISECONDS_PER_SECOND = 1000;

type CanvasArticleImage = {
  alt?: string;
  height?: number;
  src?: string;
  width?: number;
};

type CanvasArticleReference = {
  created?: number | string;
  field_image?: {
    field_media_image?: CanvasArticleImage;
  };
  field_summary?: string;
  id?: number | string;
  label?: string;
  path?: string;
};

type CanvasArticleCardProps = {
  article?: CanvasArticleReference;
  className?: string;
};

function resolveDrupalMediaUrl(source: string): string {
  try {
    return new URL(source).toString();
  } catch {
    const siteUrl = process.env.CANVAS_SITE_URL ?? process.env.DRUPAL_BASE_URL;
    return siteUrl ? new URL(source, siteUrl).toString() : source;
  }
}

function formatPublishedAt(value: number | string | undefined, locale: Locale) {
  if (value === undefined) {
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
  article: CanvasArticleReference | undefined,
  locale: Locale
): ArticleTeaser | undefined {
  const title = article?.label?.trim();
  const summary = article?.field_summary?.trim();
  if (!(article && title && summary)) {
    return;
  }

  const path =
    article.path?.trim() ||
    (article.id === undefined ? undefined : `/node/${article.id}`);
  if (!path) {
    return;
  }

  const sourceImage = article.field_image?.field_media_image;
  const image = sourceImage?.src
    ? {
        altText: sourceImage.alt ?? "",
        height: sourceImage.height,
        url: resolveDrupalMediaUrl(sourceImage.src),
        width: sourceImage.width,
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

export default async function CanvasArticleCard({
  article,
  className,
}: CanvasArticleCardProps) {
  const locale = await getLocale();
  const teaser = toCanvasArticleTeaser(article, locale);
  if (!teaser) {
    return null;
  }

  const t = await getTranslations({ locale, namespace: "web.article" });

  return (
    <ArticleCard
      article={teaser}
      className={className}
      readMoreLabel={t("readGuide")}
    />
  );
}
