import type { ContentSearchProjection } from "@repo/search/content-search-projection";
import type { IndexSettings } from "algoliasearch";

const algoliaSearchableAttribute = ({
  attribute,
  ordered,
}: ReturnType<ContentSearchProjection["searchableAttributes"]>[number]) =>
  ordered ? attribute : `unordered(${attribute})`;

/** Compiles a CMS-owned Content projection into Algolia index settings. */
export const contentIndexSettings = (
  projection: ContentSearchProjection,
  locales: readonly string[]
): IndexSettings => ({
  attributesForFaceting: projection.filterAttributes.map(
    (attribute) => `filterOnly(${attribute})`
  ),
  attributesToRetrieve: [...projection.attributesToRetrieve],
  searchableAttributes: projection
    .searchableAttributes(locales)
    .map(algoliaSearchableAttribute),
  unretrievableAttributes: [...projection.filterAttributes],
});
