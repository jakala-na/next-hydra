import { documentToReactComponents } from "@contentful/rich-text-react-renderer";
import { ArticlePage as ArticlePageView } from "@repo/design-system/components/cms/pages/article";
import type { Locale } from "@repo/i18n";

import type { ContentfulArticle } from "../../content";
import {
  formatContentfulPublishedAt,
  toContentfulImage,
} from "../../lib/content";

type ArticlePageProps = {
  readonly data: ContentfulArticle;
  readonly locale: Locale;
};

export function ArticlePage({ data, locale }: ArticlePageProps) {
  return (
    <ArticlePageView
      body={data.body ? documentToReactComponents(data.body.json) : null}
      image={toContentfulImage(data.image)}
      publishedAt={formatContentfulPublishedAt(data.sys.publishedAt, locale)}
      summary={data.summary}
      title={data.title}
    />
  );
}
