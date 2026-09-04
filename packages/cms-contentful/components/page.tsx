import { ArchitectureBoundary } from "@repo/design-system/components/architecture/architecture-boundary";
import type { Locale } from "@repo/i18n";
import { hasLocale } from "@repo/i18n";
import { routing } from "@repo/i18n/routing";
import { cacheLife, cacheTag } from "next/cache";
import { draftMode } from "next/headers";
import { notFound } from "next/navigation";

import { fetchContentfulPage } from "../fetch-page";
import { PageRenderer } from "./page-renderer";

async function getCachedContentfulPage(url: string, locale: Locale) {
  "use cache";

  const page = await fetchContentfulPage(url, locale, false);
  if (!page) {
    cacheLife({ expire: 0, revalidate: 0, stale: 0 });
    return;
  }

  cacheLife("hours");
  cacheTag("contentful");
  return page;
}

export async function Page(props: {
  readonly locale: Locale;
  readonly url: string;
}) {
  const { locale, url } = props;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  const { isEnabled: preview } = await draftMode();
  const page = preview
    ? await fetchContentfulPage(url, locale, true)
    : await getCachedContentfulPage(url, locale);
  if (!page) {
    notFound();
  }

  return (
    <ArchitectureBoundary
      cacheProfile={
        preview ? "preview cache bypass" : "Contentful delivery cache"
      }
      cacheTags={preview ? [] : ["contentful"]}
      component="server"
      description="One GraphQL query resolves the Contentful entry and selects its page template by __typename."
      layer="route"
      layerLabel="CMS route and page registry"
      name="ContentfulPageRoute"
      rendering={preview ? "dynamic" : "cached"}
      source="cms"
      sourceLabel="Contentful CMS"
    >
      <PageRenderer data={page} locale={locale} />
    </ArchitectureBoundary>
  );
}
