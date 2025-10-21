import { cn } from "@repo/design-system/lib/utils";
import type { Locale } from "@repo/i18n";
import { hasLocale } from "@repo/i18n";
import { routing } from "@repo/i18n/routing";
import {
  unstable_cacheLife as cacheLife,
  unstable_cacheTag as cacheTag,
} from "next/cache";
import { draftMode, headers } from "next/headers";
import { notFound } from "next/navigation";
import { getRouteClient } from "@repo/cms/client";
import { entryLivePreview } from "@repo/cms/lib/utils/live-preview-helper";
import ComponentRenderer from "@repo/cms/components/component-renderer";

export async function LandingPage(props: { url: string; locale: Locale }) {
  "use cache";
  const { url, locale } = props;
  cacheLife("minutes");
  cacheTag(`page:${url}`);

  const route = {
    params: {path: url},
    searchParams: {}
  };

  const client = getRouteClient();
  const response = await client.getRoute({ path: url, resolutionDepth: 3 });
  
  if (response.type === 'composition') {
    const composition = response.compositionApiResponse.composition;
    return (
      <>
        <ComponentRenderer components={composition.slots?.content ?? []} locale={locale} />
      </>
    );
  } else if (response.type === 'notFound') {
    notFound();
  } else if (response.type === 'redirect') {
    // TODO: Handle redirect
  }
}
