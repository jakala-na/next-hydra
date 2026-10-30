import type { NextTask } from "@repo/cli-core/output-model";
import type { ContentIndexingOperation } from "@repo/search/content-indexing";
import type { ConfiguredContentSearchMapping } from "@repo/search/content-search-app";
import { defineContentSearchProjection } from "@repo/search/content-search-projection";
import type {
  ContentSearchProjection,
  ContentSearchProjectionFactory,
} from "@repo/search/content-search-projection";
import type { ContentSearchCard } from "@repo/search/contract";
import { decodeContentSearchHit } from "@repo/search/contract";
import { Config, ConfigProvider, Effect, Schema } from "effect";
import type { Effect as EffectType } from "effect";

import { keys } from "./keys";
import type { SearchContentType } from "./recipe/search/types";

type MutableContentSearchCard = {
  -readonly [Key in keyof ContentSearchCard]: ContentSearchCard[Key];
};

const ContentstackContentRecord = Schema.Struct({
  _content_type: Schema.optional(Schema.String),
  content: Schema.Struct({
    description: Schema.optional(Schema.String),
    id: Schema.NonEmptyString,
    image: Schema.optional(
      Schema.Struct({
        altText: Schema.String,
        height: Schema.optional(Schema.Int),
        url: Schema.NonEmptyString,
        width: Schema.optional(Schema.Int),
      })
    ),
    path: Schema.String,
    published: Schema.optional(Schema.String),
    title: Schema.NonEmptyString,
  }),
  objectID: Schema.NonEmptyString,
});
const decodeContentstackContentRecord = Schema.decodeUnknownSync(
  ContentstackContentRecord
);

export interface ContentstackSearchProjectionOptions {
  readonly branch: string;
  readonly environment: string;
  readonly indexName: string;
  readonly contentTypes: readonly SearchContentType[];
}

export const contentIndexingOperations = [
  "list-indices",
  "search",
  "upsert",
  "delete",
] as const satisfies readonly ContentIndexingOperation[];

export const createContentIndexingHandoff = (
  contentTypes: readonly SearchContentType[],
  indexName: string,
  context: {
    readonly appInstalled?: boolean;
    readonly credentialsLocation?: string;
    readonly configuredMappings?: readonly ConfiguredContentSearchMapping[];
  } = {}
) =>
  ({
    tasks: [
      ...(context.appInstalled
        ? []
        : [
            {
              id: "cms.contentstack.configure-app",
              title: "Configure the Contentstack Algolia app",
              where: "Contentstack > your stack > Algolia app",
              detail: `Use ALGOLIA_APPLICATION_ID and ALGOLIA_CONTENT_WRITE_API_KEY from ${context.credentialsLocation ?? "the private search credential file"}. Set the destination index to "${indexName}". Choose --store local for manual setup, or --install-content-search-app to configure the app directly; Vercel sensitive keys cannot be read back.`,
              verify:
                "The app uses the provisioned index and scoped content write key.",
            },
          ]),
      ...contentTypes
        .filter(
          (type) =>
            !context.configuredMappings?.some(
              (mapping) =>
                mapping.contentTypeUid === type.uid &&
                type.mappingFields.every((field) =>
                  mapping.fields.includes(field)
                )
            )
        )
        .map(
          (type): NextTask => ({
            id: `cms.contentstack.mapping.${type.uid}`,
            title: `Configure content mappings: ${type.label}`,
            where: `Contentstack > Algolia app > mappings > ${type.uid}`,
            detail: `Select ${type.label} (${type.uid}) for the branch and environment you index. Map fields ${type.mappingFields.join(", ")} to searchable text under ${type.searchTextRoot}. Match the branch and locale paths in Algolia > ${indexName} > Configuration > Searchable attributes.`,
            verify: `${type.label} has mappings for every locale passed to search provision.`,
          })
        ),
      ...contentTypes.flatMap((type) =>
        type.instructions.length
          ? [
              {
                id: `cms.contentstack.review.${type.uid}`,
                title: `Review content setup: ${type.label}`,
                where: `Contentstack > ${type.label} (${type.uid})`,
                detail: type.instructions.join(" "),
                verify: `Published ${type.label} entries contain the expected searchable content.`,
              },
            ]
          : []
      ),
      {
        id: "cms.contentstack.initial-sync",
        title: "Run the initial content sync",
        where: "Contentstack > Algolia app",
        detail:
          "Start the app's initial content sync. The app handles later publish and unpublish updates.",
        verify: `Published entries appear in "${indexName}" in Algolia.`,
      },
      {
        id: "cms.contentstack.verify-records",
        title: "Verify indexed content",
        where: `Algolia > ${indexName} > Browse`,
        detail: `Inspect a published record from each configured content type: ${contentTypes.map(({ label, uid }) => `${label} (${uid})`).join(", ")}. Check objectID, _content_type, content.id, content.title, content.path, environment, and publish_details.locale. Map summary text to content.description when available. If content.image is included, it needs url and altText. Correct missing fields in the mappings and sync again.`,
        verify:
          "Search returns a published entry from each intended content type with the expected title and working link in each provisioned locale.",
      },
    ],
    title: "Complete Content indexing in Contentstack",
  }) as const;

/** Describes the Contentstack connector's existing Content index shape. */
export const createContentstackSearchProjection = ({
  branch,
  environment,
  indexName,
  contentTypes,
}: ContentstackSearchProjectionOptions): ContentSearchProjection => {
  const contentTypePath = (contentType: string) =>
    branch === "main" ? contentType : `${contentType}.${branch}`;
  const searchableAttributes = (locale: string) =>
    contentTypes.map(({ searchTextRoot }) => ({
      attribute: `${contentTypePath(searchTextRoot)}.${locale}`,
      ordered: true,
    }));

  return defineContentSearchProjection({
    attributesToRetrieve: ["objectID", "_content_type", "content"],
    filterAttributes: ["environment", "publish_details.locale"],
    filters: (audience) => [
      { attribute: "environment", values: [environment] },
      {
        attribute: "publish_details.locale",
        values: [audience.locale.toLowerCase()],
      },
    ],
    indexName: () => indexName,
    restrictSearchableAttributes: (audience) =>
      searchableAttributes(audience.locale).map(({ attribute }) => attribute),
    searchableAttributes: (locales) => locales.flatMap(searchableAttributes),
    toContentSearchHit: (record) => {
      const hit = decodeContentstackContentRecord(record);
      const contentCard: MutableContentSearchCard = {
        id: hit.content.id,
        path: hit.content.path,
        summary: hit.content.description ?? "",
        title: hit.content.title,
      };
      if (hit._content_type !== undefined) {
        contentCard.contentType = hit._content_type;
      }
      if (hit.content.image !== undefined) {
        contentCard.image = hit.content.image;
      }
      if (hit.content.published !== undefined) {
        contentCard.publishedAt = hit.content.published;
      }
      return decodeContentSearchHit({
        contentCard,
        objectID: hit.objectID,
      });
    },
  });
};

/** Runtime composition for the selected CMS provider. */
const createContentSearchProjection =
  (
    contentTypes: readonly SearchContentType[]
  ): ContentSearchProjectionFactory =>
  (indexName) => {
    const config = keys();
    return createContentstackSearchProjection({
      contentTypes,
      branch: config.CONTENTSTACK_BRANCH,
      environment: config.CONTENTSTACK_ENVIRONMENT,
      indexName,
    });
  };

/** CLI composition that honors the command's ConfigProvider, including --env-file. */
export const loadContentSearchProjection = <E, R>(
  contentTypes: readonly SearchContentType[],
  indexName: string,
  configProvider: EffectType.Effect<ConfigProvider.ConfigProvider, E, R>
) =>
  Effect.gen(function* () {
    const branch = yield* Config.NonEmptyString("CONTENTSTACK_BRANCH").pipe(
      Config.withDefault("main")
    );
    const environment = yield* Config.NonEmptyString(
      "CONTENTSTACK_ENVIRONMENT"
    );

    return createContentstackSearchProjection({
      contentTypes,
      branch,
      environment,
      indexName,
    });
  }).pipe(Effect.provide(ConfigProvider.layer(configProvider)));

/** Both the web runtime and CLI bind the same materialized recipe definitions. */
export function createContentstackSearch(
  contentTypes: readonly SearchContentType[]
) {
  return {
    createContentSearchProjection: createContentSearchProjection(contentTypes),
    createContentIndexingHandoff: (
      indexName: string,
      context?: Parameters<typeof createContentIndexingHandoff>[2]
    ) => createContentIndexingHandoff(contentTypes, indexName, context),
    loadContentSearchProjection: <E, R>(
      indexName: string,
      configProvider: EffectType.Effect<ConfigProvider.ConfigProvider, E, R>
    ) => loadContentSearchProjection(contentTypes, indexName, configProvider),
  };
}
