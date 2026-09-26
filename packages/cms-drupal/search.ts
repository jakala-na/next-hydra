import { defineContentSearchProjection } from "@repo/search/content-search-projection";
import type {
  ContentSearchProjection,
  ContentSearchProjectionFactory,
} from "@repo/search/content-search-projection";
import { decodeContentSearchHit } from "@repo/search/contract";
import { Effect } from "effect";
import { z } from "zod";

import { toContentPath } from "./lib/content-path";

const drupalContentRecordSchema = z.object({
  content_type: z.string().min(1),
  id: z.string().min(1),
  objectID: z.string().min(1),
  path: z.string().min(1),
  summary: z.string().default(""),
  title: z.string().min(1),
});

const drupalLangcodeByLocale = new Map<string, string>([
  ["de-DE", "de"],
  ["en-GB", "en-gb"],
  ["en-US", "en"],
  ["es-ES", "es"],
  ["fr-FR", "fr"],
  ["it-IT", "it"],
  ["nl-NL", "nl"],
  ["pt-PT", "pt-pt"],
]);

function drupalLangcode(locale: string): string {
  return drupalLangcodeByLocale.get(locale) ?? locale.toLowerCase();
}

export const createContentIndexingHandoff = (indexName: string) =>
  ({
    instructions: [
      `Configure Drupal with ALGOLIA_APPLICATION_ID, a dedicated ALGOLIA_DRUPAL_WRITE_API_KEY with search, browse, addObject, and deleteObject permissions restricted to "${indexName}", and ALGOLIA_CONTENT_INDEX_NAME="${indexName}".`,
      "Run `drush cr` (`ddev drush cr` locally) so Drupal loads the Algolia credentials and provisioned index name.",
      "Run `drush search-api:rebuild-tracker content`, then `drush search-api:index content` for the initial backfill (prefix both commands with `ddev` locally).",
      "New Content saves are indexed directly. Keep Drupal cron running to drain pending work. Search API Algolia can log failed writes while marking items processed; after correcting a delivery failure, rebuild the tracker and reindex, then verify the records in Algolia.",
    ],
    title: "Complete Content indexing in Drupal",
  }) as const;

/** Describes the flat records produced by Drupal Search API Algolia. */
export function createDrupalSearchProjection(
  indexName: string
): ContentSearchProjection {
  return defineContentSearchProjection({
    attributesToRetrieve: [
      "objectID",
      "content_type",
      "id",
      "path",
      "summary",
      "title",
    ],
    filterAttributes: ["search_api_language"],
    filters: (audience) => [
      {
        attribute: "search_api_language",
        values: [drupalLangcode(audience.locale)],
      },
    ],
    indexName: () => indexName,
    searchableAttributes: () => [
      { attribute: "title", ordered: true },
      { attribute: "summary", ordered: false },
    ],
    toContentSearchHit: (record) => {
      const hit = drupalContentRecordSchema.parse(record);
      return decodeContentSearchHit({
        contentCard: {
          contentType: hit.content_type,
          id: hit.id,
          path: toContentPath(hit.path),
          summary: hit.summary,
          title: hit.title,
        },
        objectID: hit.objectID,
      });
    },
  });
}

export const createContentSearchProjection: ContentSearchProjectionFactory = (
  indexName
) => createDrupalSearchProjection(indexName);

/** Drupal's Search API projection does not require CMS-specific CLI settings. */
export const loadContentSearchProjection = <E, R>(
  indexName: string,
  _configProvider: Effect.Effect<unknown, E, R>
) => Effect.succeed(createContentSearchProjection(indexName));
