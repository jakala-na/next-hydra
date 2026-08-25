import { timingSafeEqual } from "node:crypto";

const CACHE_TAG_PATTERN = /^[\w:.-]+$/;
const MAXIMUM_CACHE_TAGS = 32;
const MAXIMUM_CACHE_TAG_LENGTH = 255;

export function cacheTagsFromParameter(value: string | null): string[] {
  if (!value) {
    return [];
  }

  const tags = [...new Set(value.split(",").map((tag) => tag.trim()))];
  if (tags.length > MAXIMUM_CACHE_TAGS) {
    return [];
  }

  return tags.every(
    (tag) =>
      tag.length > 0 &&
      tag.length <= MAXIMUM_CACHE_TAG_LENGTH &&
      CACHE_TAG_PATTERN.test(tag)
  )
    ? tags
    : [];
}

export function revalidationSecretsMatch(
  provided: string | null,
  configured: string | undefined
): boolean {
  if (!(provided && configured)) {
    return false;
  }

  const providedBytes = Buffer.from(provided);
  const configuredBytes = Buffer.from(configured);

  return (
    providedBytes.length === configuredBytes.length &&
    timingSafeEqual(providedBytes, configuredBytes)
  );
}
