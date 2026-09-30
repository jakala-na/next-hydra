import { Schema } from "effect";
import type { SearchClient } from "instantsearch.js";

/** Collection-specific payloads are decoded by the installed card adapters. */
export const SearchHit = Schema.StructWithRest(
  Schema.Struct({ objectID: Schema.String }),
  [Schema.Record(Schema.String, Schema.Unknown)]
);
export type SearchHit = typeof SearchHit.Type;

export const CONTENT_INDEX_ALIASES = ["content"] as const;
export type ContentIndexAlias = (typeof CONTENT_INDEX_ALIASES)[number];

export const QUERY_SUGGESTION_INDEX_ALIASES = ["query-suggestions"] as const;
export type QuerySuggestionIndexAlias =
  (typeof QUERY_SUGGESTION_INDEX_ALIASES)[number];

export type SearchIndexAlias = string;

export const CONTENT_HIT_ATTRIBUTES = ["objectID", "contentCard"] as const;
export const QUERY_SUGGESTION_HIT_ATTRIBUTES = [
  "objectID",
  "query",
  "popularity",
  "nb_words",
] as const;

export const ContentSearchImage = Schema.Struct({
  altText: Schema.String,
  height: Schema.optional(Schema.Int),
  url: Schema.NonEmptyString,
  width: Schema.optional(Schema.Int),
});
export type ContentSearchImage = typeof ContentSearchImage.Type;

export const ContentSearchCard = Schema.Struct({
  contentType: Schema.optional(Schema.NonEmptyString),
  id: Schema.NonEmptyString,
  image: Schema.optional(ContentSearchImage),
  path: Schema.String.pipe(
    Schema.check(
      Schema.isMinLength(1),
      Schema.isPattern(/^\/(?!\/)/u, {
        message: "Content paths must be application-relative",
      })
    )
  ),
  publishedAt: Schema.optional(Schema.String),
  summary: Schema.String,
  title: Schema.NonEmptyString,
});
export type ContentSearchCard = typeof ContentSearchCard.Type;

export const ContentSearchHit = Schema.Struct({
  contentCard: ContentSearchCard,
  objectID: Schema.NonEmptyString,
});
export type ContentSearchHit = typeof ContentSearchHit.Type;

export const decodeContentSearchHit =
  Schema.decodeUnknownSync(ContentSearchHit);

export const QuerySuggestionSearchHit = Schema.Struct({
  nb_words: Schema.Int.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(1))),
  objectID: Schema.NonEmptyString,
  popularity: Schema.Finite,
  query: Schema.NonEmptyString,
});
export type QuerySuggestionSearchHit = typeof QuerySuggestionSearchHit.Type;

export const decodeQuerySuggestionSearchHit = Schema.decodeUnknownSync(
  QuerySuggestionSearchHit
);

type InstantSearchRequest = Parameters<SearchClient["search"]>[0][number];

export type SearchRequest = Omit<InstantSearchRequest, "indexName"> & {
  readonly indexName: SearchIndexAlias;
};
export type SearchBatch = SearchRequest[];
export type SearchBatchResult = Awaited<ReturnType<SearchClient["search"]>>;

export interface ProductSearchAudience {
  readonly storeKey: string;
  readonly currency: string;
  /** Opaque pricing audience IDs resolved by Commerce; empty means public. */
  readonly priceAudienceIds: readonly string[];
}

export interface SearchAudience {
  readonly locale: string;
  readonly product?: ProductSearchAudience;
}

export interface SearchProvider {
  readonly search: (
    batch: SearchBatch,
    audience: SearchAudience,
    signal?: AbortSignal
  ) => Promise<SearchBatchResult>;
}

/** Canonical Content document projected from the selected CMS indexer. */
export interface ContentSearchDocument extends ContentSearchHit {
  readonly locales: readonly string[];
}

export const isContentIndexAlias = (
  indexName: string
): indexName is ContentIndexAlias => indexName === "content";
