import { Schema } from "effect";

/**
 * Stable failure contract for commerce providers that expose Product indexing
 * capabilities to a selected search provider.
 */
export class CommerceSearchIndexingFailure extends Schema.TaggedError<CommerceSearchIndexingFailure>()(
  "CommerceSearchIndexingFailure",
  {
    cause: Schema.optional(Schema.Defect()),
    message: Schema.String,
    operation: Schema.Literals([
      "deleteManagedApiClient",
      "reconcileManagedApiClient",
      "resolveIndexingContext",
    ]),
  }
) {}
