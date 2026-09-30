import { Schema } from "effect";

export const AlgoliaSearchRecord = Schema.StructWithRest(
  Schema.Struct({ objectID: Schema.String }),
  [Schema.Record(Schema.String, Schema.Unknown)]
);
export type AlgoliaSearchRecord = typeof AlgoliaSearchRecord.Type;
