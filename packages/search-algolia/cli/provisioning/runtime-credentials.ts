import { runtimeEnvironmentManifestFromSchema } from "@repo/cli-core/runtime-environment";
import { Schema } from "effect";
import type { Redacted } from "effect";

const requiredSearchRuntimeEnvironmentSchema = {
  ALGOLIA_APPLICATION_ID: Schema.String,
  ALGOLIA_SEARCH_API_KEY: Schema.Redacted(Schema.String),
} as const;

export const searchRuntimeEnvironmentManifest = (
  indexPrefix: string | undefined,
  products = false
) => {
  const schema = products
    ? {
        ...requiredSearchRuntimeEnvironmentSchema,
        ALGOLIA_PRICE_CUSTOMER_GROUP_IDS: Schema.String,
      }
    : requiredSearchRuntimeEnvironmentSchema;
  return runtimeEnvironmentManifestFromSchema(
    indexPrefix === undefined || indexPrefix.trim().length === 0
      ? schema
      : { ...schema, ALGOLIA_INDEX_PREFIX: Schema.String },
    ["web"]
  );
};

export const searchRuntimeEnvironment = (credentials: {
  readonly applicationId: string;
  readonly indexPrefix: string | undefined;
  readonly priceCustomerGroupIds?: readonly string[] | undefined;
  readonly searchApiKey: Redacted.Redacted;
}) => {
  const base = {
    ALGOLIA_APPLICATION_ID: credentials.applicationId,
    ALGOLIA_SEARCH_API_KEY: credentials.searchApiKey,
  };
  const required =
    credentials.priceCustomerGroupIds === undefined
      ? base
      : {
          ...base,
          ALGOLIA_PRICE_CUSTOMER_GROUP_IDS:
            credentials.priceCustomerGroupIds.join(","),
        };
  return credentials.indexPrefix === undefined ||
    credentials.indexPrefix.trim().length === 0
    ? required
    : { ...required, ALGOLIA_INDEX_PREFIX: credentials.indexPrefix };
};
