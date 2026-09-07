import { ArchitectureBoundary } from "@repo/design-system/components/architecture/architecture-boundary";
import { ArticleCard } from "@repo/design-system/components/cms/article-card";
import type { ArticleTeaser } from "@repo/design-system/components/cms/article-card";
import type { Locale } from "@repo/i18n";
import { getPathname } from "@repo/i18n/navigation";
import type { Route } from "next";
import type { ReactElement } from "react";

import type { ContentSearchHit } from "./contract";

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
      component="client"
      description="Presents the canonical Resource card carried by a provider-normalized search hit."
      layer="presentation"
      layerLabel="Resource search hit presentation adapter"
      name="SearchResourceCard"
      rendering="streamed"
      source="search"
      sourceLabel="Search provider"
    >
      <ArticleCard
        article={toSearchResourceCardPresentation(hit, locale)}
        layout={layout}
      />
    </ArchitectureBoundary>
  );
}
