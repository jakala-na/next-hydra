import type { Page } from "@drupal-canvas/headless";
import { z } from "zod";

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

const canvasCacheabilitySchema = z.object({
  contexts: z.array(z.string()),
  maxAge: z.number().int(),
  tags: z.array(z.string()),
});
type CanvasCacheability = z.infer<typeof canvasCacheabilitySchema>;

const canvasPageCacheabilitySchema = z.object({
  cacheability: canvasCacheabilitySchema,
});

/**
 * Reads the cacheability field supplied by the patched Drupal SDK at runtime.
 * The compatibility helper keeps this package type-checkable while Drupal is
 * not the materialized CMS and its provider-specific patches are not applied.
 */
export const getCanvasPageCacheability = (
  page: Page
): CanvasCacheability | undefined => {
  const parsed = canvasPageCacheabilitySchema.safeParse(page);
  return parsed.success ? parsed.data.cacheability : undefined;
};

export const getCanvasCachePolicy = (
  cacheability: CanvasCacheability | undefined
): CanvasCachePolicy | undefined => {
  const parsed = canvasCacheabilitySchema.safeParse(cacheability);
  if (!parsed.success) {
    return undefined;
  }
  const { maxAge } = parsed.data;
  if (maxAge === 0) {
    return undefined;
  }

  const tags = [...new Set(parsed.data.tags)];
  if (tags.length === 0 || tags.some((tag) => tag.length === 0)) {
    return undefined;
  }

  const tagsOverflow =
    tags.length > NEXT_CACHE_TAG_MAX_ITEMS ||
    tags.some((tag) => tag.length > NEXT_CACHE_TAG_MAX_LENGTH);

  if (maxAge === DRUPAL_CACHE_PERMANENT) {
    return {
      life: {
        expire: Number.POSITIVE_INFINITY,
        revalidate: Number.POSITIVE_INFINITY,
        stale: ROUTER_STALE_SECONDS,
      },
      tags: tagsOverflow ? [] : tags,
    };
  }

  if (maxAge < 0) {
    return undefined;
  }

  return {
    life: {
      expire: maxAge,
      revalidate: maxAge,
      stale: Math.min(ROUTER_STALE_SECONDS, maxAge),
    },
    tags: tagsOverflow ? [] : tags,
  };
};
