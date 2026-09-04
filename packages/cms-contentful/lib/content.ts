import type {
  ArticleImage,
  ArticleTeaser,
} from "@repo/design-system/components/cms/article-card";
import type { Locale } from "@repo/i18n";
import { getPathname } from "@repo/i18n/navigation";

import type {
  ContentfulArticle,
  ContentfulAsset,
  ContentfulCallToAction,
} from "../content";

const withLeadingSlash = (slug: string) =>
  slug.startsWith("/") ? slug : `/${slug}`;

export function toContentfulImage(
  asset: ContentfulAsset | null | undefined
): ArticleImage | undefined {
  if (!asset?.url) {
    return;
  }

  return {
    altText: asset.description ?? asset.title ?? "",
    height: asset.height ?? undefined,
    url: asset.url,
    width: asset.width ?? undefined,
  };
}

export function toContentfulPath(slug: string, locale: Locale): string {
  return getPathname({ href: withLeadingSlash(slug), locale });
}

export function formatContentfulPublishedAt(
  value: string | null | undefined,
  locale: Locale
): string | undefined {
  if (!value) {
    return;
  }

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "long",
  }).format(new Date(value));
}

export function toContentfulArticleTeaser(
  article: ContentfulArticle,
  locale: Locale
): ArticleTeaser {
  return {
    href: toContentfulPath(article.slug, locale),
    id: article.sys.id,
    image: toContentfulImage(article.image),
    publishedAt: formatContentfulPublishedAt(article.sys.publishedAt, locale),
    summary: article.summary,
    title: article.title,
  };
}

export function toContentfulCallToAction(
  action: ContentfulCallToAction,
  locale: Locale
): { label: string; url: string } | undefined {
  const internalSlug = action.internalContent?.slug;
  const url = internalSlug
    ? toContentfulPath(internalSlug, locale)
    : action.externalUrl;

  return url ? { label: action.label, url } : undefined;
}
