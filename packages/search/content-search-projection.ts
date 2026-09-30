import { CONTENT_HIT_ATTRIBUTES, decodeContentSearchHit } from "./contract";
import type { ContentSearchHit, SearchAudience } from "./contract";

export interface ContentSearchFilter {
  readonly attribute: string;
  readonly values: readonly [string, ...string[]];
}

export interface ContentSearchableAttribute {
  readonly attribute: string;
  readonly ordered: boolean;
}

export interface ContentSearchRecord {
  readonly objectID: string;
}

/**
 * Describes how a selected CMS projects its indexed records into Search.
 * Search providers compile these physical paths and filters into their own
 * request and index-setting formats.
 */
export interface ContentSearchProjection {
  readonly attributesToRetrieve: readonly string[];
  readonly filterAttributes: readonly string[];
  readonly filters: (
    audience: SearchAudience
  ) => readonly ContentSearchFilter[];
  readonly indexName: (audience: SearchAudience) => string;
  readonly restrictSearchableAttributes?: (
    audience: SearchAudience
  ) => readonly string[];
  readonly searchableAttributes: (
    locales: readonly string[]
  ) => readonly ContentSearchableAttribute[];
  readonly toContentSearchHit: (
    record: ContentSearchRecord,
    audience: SearchAudience
  ) => ContentSearchHit;
}

export type ContentSearchProjectionFactory = (
  indexName: string
) => ContentSearchProjection;

export const defineContentSearchProjection = <
  const Projection extends ContentSearchProjection,
>(
  projection: Projection
): Projection => projection;

export const createCanonicalContentSearchProjection = (
  indexName: string
): ContentSearchProjection =>
  defineContentSearchProjection({
    attributesToRetrieve: CONTENT_HIT_ATTRIBUTES,
    filterAttributes: ["locales"],
    filters: (audience) => [
      { attribute: "locales", values: [audience.locale] },
    ],
    indexName: () => indexName,
    searchableAttributes: () => [
      { attribute: "contentCard.title", ordered: true },
      { attribute: "contentCard.summary", ordered: false },
    ],
    toContentSearchHit: (record) => decodeContentSearchHit(record),
  });
