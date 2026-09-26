import { ArticlePage } from "@repo/design-system/components/cms/pages/article";
import type { Locale } from "@repo/i18n";

import type { CanvasComponentProps } from "../../generated/canvas-component-props";

export type CanvasArticleProps = CanvasComponentProps<"article"> & {
  locale?: Locale;
};

export default function CanvasArticle({
  body,
  image,
  locale = "en-US",
  publishedAt,
  summary,
  title,
}: CanvasArticleProps) {
  const siteUrl = process.env.CANVAS_SITE_URL;
  return (
    <ArticlePage
      body={body}
      image={
        image
          ? {
              altText: image.alt ?? "",
              height: image.height,
              url: siteUrl ? new URL(image.src, siteUrl).href : image.src,
              width: image.width,
            }
          : undefined
      }
      publishedAt={
        publishedAt
          ? new Intl.DateTimeFormat(locale, {
              dateStyle: "long",
              timeZone: "UTC",
            }).format(new Date(`${publishedAt}T00:00:00Z`))
          : undefined
      }
      summary={summary}
      title={title}
    />
  );
}
