import { isCanvasComponentTreeDraft } from "@drupal-canvas/headless";
import { getDraftConfig, getDraftData } from "@drupal-canvas/headless-next";
import type { Locale } from "@repo/i18n";
import { cacheLife, cacheTag } from "next/cache";
import { draftMode } from "next/headers";
import { type CSSProperties, cache } from "react";
import { keys } from "../keys";
import { getCanvasCachePolicy } from "../lib/canvas-cacheability";
import { fetchCanvasGlobalRegions } from "../lib/canvas-global-region";
import { toDrupalPath } from "../lib/locale";
import { CanvasComponentTree } from "./canvas-component-tree";

export type CmsGlobalRegionName =
  | "pre-header"
  | "post-header"
  | "pre-footer"
  | "post-footer";

type CmsGlobalRegionProps = {
  locale: Locale;
  name: CmsGlobalRegionName;
};

const drupalRegionByName = {
  "post-footer": "post_footer",
  "post-header": "post_header",
  "pre-footer": "pre_footer",
  "pre-header": "pre_header",
} as const satisfies Record<CmsGlobalRegionName, string>;

const compactDraftRegionStyle = {
  "--canvas--sortable-empty-region-height": "64px",
  display: "contents",
} as CSSProperties;

async function getCachedRegions(path: string) {
  "use cache";

  const config = keys();
  const result = await fetchCanvasGlobalRegions(path, {
    baseUrl: config.CANVAS_SITE_URL ?? config.DRUPAL_BASE_URL,
  });
  if (!result) {
    cacheLife({ expire: 0, revalidate: 0, stale: 0 });
    return null;
  }

  const policy = getCanvasCachePolicy(result.cacheability);
  if (!policy) {
    cacheLife({ expire: 0, revalidate: 0, stale: 0 });
    return result;
  }

  cacheLife(policy.life);
  if (policy.tags.length > 0) {
    cacheTag(...policy.tags);
  }
  return result;
}

const getRegions = cache(async (locale: Locale) => {
  const path = toDrupalPath("/canvas/regions-api", locale);
  const { isEnabled } = await draftMode();
  return isEnabled
    ? await fetchCanvasGlobalRegions(path, {
        baseUrl: getDraftConfig().baseUrl,
        draftData: await getDraftData(),
      })
    : await getCachedRegions(path);
});

export async function CmsGlobalRegion({ locale, name }: CmsGlobalRegionProps) {
  const regionId = drupalRegionByName[name];
  const result = await getRegions(locale);
  const content = result?.regions[regionId] ?? null;

  if (!content) {
    return null;
  }

  const tree = <CanvasComponentTree regionId={regionId} tree={content} />;
  return isCanvasComponentTreeDraft(content) ? (
    <div data-canvas-global-region={regionId} style={compactDraftRegionStyle}>
      {tree}
    </div>
  ) : (
    tree
  );
}
