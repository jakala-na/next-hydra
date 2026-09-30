import type { SearchAudience } from "@repo/search/contract";

/**
 * One stable tag joins runtime Product and Content searches to the
 * locale-specific Query Suggestions configuration that consumes their
 * analytics.
 */
export const algoliaSearchAnalyticsTags = (
  indexPrefix: string | undefined,
  locale: string
): readonly [string] => {
  const localeTag = `locale:${locale.toLowerCase()}`;
  const normalizedPrefix = indexPrefix?.trim();
  return [
    normalizedPrefix === undefined || normalizedPrefix.length === 0
      ? localeTag
      : `environment:${normalizedPrefix}|${localeTag}`,
  ];
};

export const createAlgoliaAnalyticsTags =
  (indexPrefix: string | undefined) =>
  (audience: SearchAudience): readonly string[] =>
    algoliaSearchAnalyticsTags(indexPrefix, audience.locale);
