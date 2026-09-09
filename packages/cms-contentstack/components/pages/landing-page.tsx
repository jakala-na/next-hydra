import { landingPageQuery } from "@composition/cms-contentstack/pages/landing-page-query";
import { ArchitectureBoundary } from "@repo/design-system/components/architecture/architecture-boundary";
import { cn } from "@repo/design-system/lib/utils";
import type { Locale } from "@repo/i18n";
import { hasLocale } from "@repo/i18n";
import { routing } from "@repo/i18n/routing";
import { draftMode, headers } from "next/headers";
import { notFound } from "next/navigation";

import { graphqlClient } from "../../client";
import { entryLivePreview } from "../../lib/utils/live-preview-helper";
import { transformLocale } from "../../lib/utils/transform-locale";
import ComponentRenderer from "../component-renderer";

const getPageCached = async (
  url: string,
  locale: Locale,
  livePreviewHash: string | undefined
) => {
  "use cache";
  const response = await graphqlClient(livePreviewHash).query(
    landingPageQuery,
    {
      locale: transformLocale(locale),
      url,
    }
  );

  if (response.error) {
    throw new Error("Something went wrong");
  }

  const entry = response.data?.all_landing_page?.items?.[0];

  if (!entry) {
    return;
  }

  return entry;
};

export async function LandingPage(props: { url: string; locale: Locale }) {
  const { url, locale } = props;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  // Check draft mode and headers outside of cached function
  const { isEnabled: isDraftModeEnabled } = await draftMode();

  let livePreviewHash = "";
  if (isDraftModeEnabled) {
    const requestHeaders = await headers();
    livePreviewHash = requestHeaders.get("x-live-preview") ?? "";
  }

  // Call cached function with livePreviewHash parameter
  const pageData = await getPageCached(url, locale, livePreviewHash);

  if (!pageData) {
    notFound();
  }

  const livePreviewHelper = entryLivePreview(pageData, !!livePreviewHash);

  return (
    <ArchitectureBoundary
      cacheProfile="default use cache"
      component="server"
      description="A cached Contentstack query resolves the landing page and modular block registry."
      layer="route"
      layerLabel="CMS route and page registry"
      name="ContentstackPageRoute"
      rendering="cached"
      source="cms"
      sourceLabel="Contentstack CMS"
    >
      {pageData.display_title ? (
        <h1 className={cn(pageData.hide_display_title && "hidden")}>
          {pageData.display_title}
        </h1>
      ) : null}
      <ComponentRenderer
        data={pageData.components}
        livePreviewHelper={livePreviewHelper?.getNestedHelper("components")}
        dataType="modularBlocks"
        locale={locale}
      />
    </ArchitectureBoundary>
  );
}
