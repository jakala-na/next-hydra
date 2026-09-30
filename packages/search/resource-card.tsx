import { ArchitectureBoundary } from "@repo/demo-architecture/boundary";
import { ArticleCard } from "@repo/design-system/components/cms/article-card";
import type { ArticleTeaser } from "@repo/design-system/components/cms/article-card";
import type { Locale } from "@repo/i18n";
import { getPathname } from "@repo/i18n/navigation";
import type { Route } from "next";
import type { ReactElement } from "react";

import type { ContentSearchHit } from "./contract";
import { decodeContentSearchHit } from "./contract";
import type { SearchHit } from "./search-collection";

export interface SearchResourceCardProps {
  readonly hit: ContentSearchHit;
  readonly layout?: "grid" | "row";
  readonly locale: Locale;
}

export const toSearchResourceCardPresentation = (
  hit: ContentSearchHit,
  locale: Locale
): ArticleTeaser => {
  // SAFETY: ContentSearchCard validates an application-relative path and
  // getPathname combines it with an allowlisted Locale. The application catch-all
  // route accepts the resulting localized path, while Next cannot infer a Route
  // from next-intl's runtime string return type.
  const href = getPathname({ href: hit.contentCard.path, locale }) as Route;

  return {
    href,
    id: hit.contentCard.id,
    image: hit.contentCard.image,
    publishedAt: hit.contentCard.publishedAt,
    summary: hit.contentCard.summary,
    title: hit.contentCard.title,
  };
};

export function SearchResourceCard({
  hit,
  layout = "grid",
  locale,
}: SearchResourceCardProps): ReactElement {
  return (
    <ArchitectureBoundary
      composition="cms"
      description="Presents the canonical Resource card carried by a provider-normalized search hit."
      name="SearchResourceCard"
    >
      <ArticleCard
        article={toSearchResourceCardPresentation(hit, locale)}
        layout={layout}
      />
    </ArchitectureBoundary>
  );
}

export const ContentResultCard = ({
  hit,
  locale,
}: {
  readonly hit: SearchHit;
  readonly locale: Locale;
}) => (
  <SearchResourceCard
    hit={decodeContentSearchHit(hit)}
    locale={locale}
    layout="row"
  />
);
