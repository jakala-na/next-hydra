import type { ContentIndexingOperation } from "@repo/search/content-indexing";
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

export const contentIndexingOperations = [
  "list-indices",
  "search",
  "browse",
  "upsert",
  "delete",
  "clear",
] as const satisfies readonly ContentIndexingOperation[];

export const createContentIndexingHandoff = (
  indexName: string,
  context: {
    readonly credentialsLocation?: string;
  } = {}
) =>
  ({
    tasks: [
      {
        id: "cms.drupal.configure-credentials",
        title: "Configure Drupal's search credentials",
        where: "Drupal deployment configuration",
        detail: `Use ALGOLIA_APPLICATION_ID, ALGOLIA_CONTENT_WRITE_API_KEY, and ALGOLIA_CONTENT_INDEX_NAME="${indexName}" from ${context.credentialsLocation ?? "the private search credential file"}. Choose --store local for manual CMS setup; Vercel sensitive keys cannot be read back.`,
        verify:
          "Drupal has the scoped content write key and provisioned index name.",
      },
      {
        id: "cms.drupal.reload-config",
        title: "Reload Drupal configuration",
        where: "Terminal > Drupal application root",
        detail:
          "Clear caches so Drupal loads the new credentials. For DDEV, prefix each command with ddev.",
        commands: ["drush cr"],
      },
      {
        id: "cms.drupal.initial-sync",
        title: "Run the initial content backfill",
        where: "Terminal > Drupal application root",
        detail:
          "Rebuild the tracker, then index content. For DDEV, prefix each command with ddev.",
        commands: [
          "drush search-api:rebuild-tracker content",
          "drush search-api:index content",
        ],
        verify: `Published records appear in "${indexName}" in Algolia.`,
      },
      {
        id: "cms.drupal.maintain-indexing",
        title: "Keep Drupal cron running and check indexing failures",
        where: "Drupal cron and Search API logs",
        detail:
          "New Content saves are indexed directly. Keep Drupal cron running to drain pending work. Search API Algolia can log failed writes while marking items processed; after correcting a delivery failure, rebuild the tracker and reindex.",
        verify:
          "Expected records reach Algolia and failed deliveries are reconciled.",
      },
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
