import { Schema } from "effect";

export const Request = Schema.Struct({
  application: Schema.String,
  entries: Schema.Array(Schema.String),
  overwrite: Schema.Boolean,
});
export const Outcome = Schema.Union([
  Schema.TaggedStruct("Success", {}),
  Schema.TaggedStruct("RegistryFailure", { diagnostic: Schema.String }),
  Schema.TaggedStruct("WorkerDefect", { diagnostic: Schema.String }),
]);
export const RequestJson = Schema.fromJsonString(Request);
export const OutcomeJson = Schema.fromJsonString(Outcome);
