import { Schema } from "effect";

export const AlgoliaRegion = Schema.Literals(["eu", "us"]);
export type AlgoliaRegion = typeof AlgoliaRegion.Type;

export class AlgoliaProvisioningError extends Schema.TaggedError<AlgoliaProvisioningError>()(
  "AlgoliaProvisioningError",
  {
    cause: Schema.Defect(),
    message: Schema.String,
    operation: Schema.String,
  }
) {}

export class AlgoliaProvisioningReceipt extends Schema.Class<AlgoliaProvisioningReceipt>(
  "AlgoliaProvisioningReceipt"
)({
  connectors: Schema.Int,
  contentIndices: Schema.Int,
  indexPrefix: Schema.optional(Schema.NonEmptyString),
  initialReindexes: Schema.Int,
  managedCommerceApiClientId: Schema.optional(Schema.NonEmptyString),
  productPrimaries: Schema.Int,
  productReplicas: Schema.Int,
  querySuggestions: Schema.Int,
}) {}
