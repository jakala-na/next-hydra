import {
  fetchPage as fetchDraftAwareCanvasPage,
  isPageRedirect,
} from "@drupal-canvas/headless-next";
import { fetchPage as fetchPublishedCanvasPage } from "@drupal-canvas/headless/server";
import { cacheLife, cacheTag } from "next/cache";
import { draftMode } from "next/headers";
import { cache } from "react";

import { keys } from "../keys";
import {
  getCanvasCachePolicy,
  getCanvasPageCacheability,
  UNCACHED_CANVAS_LIFE,
} from "./canvas-cacheability";

async function getCachedCanvasPage(path: string) {
  "use cache";

  const config = keys();
  const page = await fetchPublishedCanvasPage(path, {
    baseUrl: config.CANVAS_SITE_URL ?? config.DRUPAL_BASE_URL,
  });

  if (!(page && !isPageRedirect(page))) {
    cacheLife(UNCACHED_CANVAS_LIFE);
    return page;
  }

  const policy = getCanvasCachePolicy(getCanvasPageCacheability(page));
  if (!policy) {
    cacheLife(UNCACHED_CANVAS_LIFE);
    return page;
  }

  cacheLife(policy.life);
  if (policy.tags.length > 0) {
    cacheTag(...policy.tags);
  }
  return page;
}

export const getCanvasPage = cache(async (path: string) => {
  const { isEnabled } = await draftMode();
  return isEnabled
    ? await fetchDraftAwareCanvasPage(path)
    : await getCachedCanvasPage(path);
});
