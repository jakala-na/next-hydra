import type { Page } from "@drupal-canvas/headless";

const DRUPAL_CACHE_PERMANENT = -1;
const NEXT_CACHE_TAG_MAX_ITEMS = 128;
const NEXT_CACHE_TAG_MAX_LENGTH = 256;
const ROUTER_STALE_SECONDS = 300;

type CanvasCacheLife = {
  expire: number;
  revalidate: number;
  stale: number;
};

export type CanvasCachePolicy = {
  life: CanvasCacheLife;
  tags: string[];
};

export function getCanvasCachePolicy(
  cacheability: Page["cacheability"] | undefined
): CanvasCachePolicy | undefined {
  if (!cacheability) {
    return;
  }

  const hasValidTags =
    Array.isArray(cacheability.tags) &&
    cacheability.tags.every((tag) => typeof tag === "string");
  if (!hasValidTags) {
    return;
  }

  const hasValidContexts =
    Array.isArray(cacheability.contexts) &&
    cacheability.contexts.every((context) => typeof context === "string");
  if (!hasValidContexts) {
    return;
  }

  if (!Number.isInteger(cacheability.maxAge) || cacheability.maxAge === 0) {
    return;
  }

  const tags = [...new Set(cacheability.tags)];
  if (tags.length === 0 || tags.some((tag) => tag.length === 0)) {
    return;
  }

  const tagsOverflow =
    tags.length > NEXT_CACHE_TAG_MAX_ITEMS ||
    tags.some((tag) => tag.length > NEXT_CACHE_TAG_MAX_LENGTH);

  if (cacheability.maxAge === DRUPAL_CACHE_PERMANENT) {
    return {
      life: {
        expire: Number.POSITIVE_INFINITY,
        revalidate: Number.POSITIVE_INFINITY,
        stale: ROUTER_STALE_SECONDS,
      },
      tags: tagsOverflow ? [] : tags,
    };
  }

  if (cacheability.maxAge < 0) {
    return;
  }

  return {
    life: {
      expire: cacheability.maxAge,
      revalidate: cacheability.maxAge,
      stale: Math.min(ROUTER_STALE_SECONDS, cacheability.maxAge),
    },
    tags: tagsOverflow ? [] : tags,
  };
}
