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

const contentTypes = ["articles", "landing_pages"] as const;

export interface ContentstackSearchProjectionOptions {
  readonly branch: string;
  readonly environment: string;
  readonly indexName: string;
}

export const createContentIndexingHandoff = (indexName: string) =>
  ({
    instructions: [
      "Open the Algolia app in Contentstack and connect it to the Algolia application identified by ALGOLIA_APPLICATION_ID with a key authorized to write Content records.",
      `Set the app's destination index to "${indexName}".`,
      "Configure the Article and Landing Page mappings to emit the fields expected by the Contentstack search projection: localized articles[.<branch>].<locale> and landing_pages[.<branch>].<locale> search fields plus objectID, _content_type, content, environment, and publish_details.locale.",
      "Run the app's initial content sync. The Contentstack app handles later publish and unpublish updates.",
    ],
    title: "Complete Content indexing in Contentstack",
  }) as const;

/** Describes the Contentstack connector's existing Content index shape. */
export const createContentstackSearchProjection = ({
  branch,
  environment,
  indexName,
}: ContentstackSearchProjectionOptions): ContentSearchProjection => {
  const contentTypePath = (contentType: (typeof contentTypes)[number]) =>
    branch === "main" ? contentType : `${contentType}.${branch}`;
  const searchableAttributes = (locale: string) =>
    contentTypes.map((contentType) => ({
      attribute: `${contentTypePath(contentType)}.${locale}`,
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
export const createContentSearchProjection: ContentSearchProjectionFactory = (
  indexName
) => {
  const config = keys();
  return createContentstackSearchProjection({
    branch: config.CONTENTSTACK_BRANCH,
    environment: config.CONTENTSTACK_ENVIRONMENT,
    indexName,
  });
};

/** CLI composition that honors the command's ConfigProvider, including --env-file. */
export const loadContentSearchProjection = <E, R>(
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
      branch,
      environment,
      indexName,
    });
  }).pipe(Effect.provide(ConfigProvider.layer(configProvider)));
