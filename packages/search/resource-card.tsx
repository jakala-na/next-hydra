import { ArchitectureBoundary } from "@repo/design-system/components/architecture/architecture-boundary";
import { ArticleCard } from "@repo/design-system/components/cms/article-card";
import type { ArticleTeaser } from "@repo/design-system/components/cms/article-card";
import type { Locale } from "@repo/i18n";
import { getPathname } from "@repo/i18n/navigation";
import type { Route } from "next";
import type { ReactElement } from "react";

import type { ResourceSearchHit } from "./contract";

export interface SearchResourceCardProps {
  readonly hit: ResourceSearchHit;
  readonly layout?: "grid" | "row";
  readonly locale: Locale;
}

export const toSearchResourceCardPresentation = (
  hit: ResourceSearchHit,
  locale: Locale
): ArticleTeaser => {
  // SAFETY: ResourceSearchCard validates an application-relative path and
  // getPathname combines it with an allowlisted Locale. The application catch-all
  // route accepts the resulting localized path, while Next cannot infer a Route
  // from next-intl's runtime string return type.
  const href = getPathname({ href: hit.resourceCard.path, locale }) as Route;

  return {
    href,
    id: hit.resourceCard.id,
    image: hit.resourceCard.image,
    publishedAt: hit.resourceCard.publishedAt,
    summary: hit.resourceCard.summary,
    title: hit.resourceCard.title,
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
