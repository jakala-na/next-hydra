import { runtimeEnvironmentManifestFromSchema } from "@repo/cli-core/runtime-environment";
import { Schema } from "effect";

import type { RuntimeCredentials } from "./model";

const commerceRuntimeEnvironmentSchema = {
  COMMERCETOOLS_CLIENT_ID: Schema.String,
  COMMERCETOOLS_CLIENT_SECRET: Schema.Redacted(Schema.String),
  COMMERCETOOLS_PROJECT_KEY: Schema.String,
  COMMERCETOOLS_REGION: Schema.String,
  COMMERCETOOLS_SCOPE: Schema.String,
} as const;

export const commerceRuntimeEnvironmentManifest =
  runtimeEnvironmentManifestFromSchema(commerceRuntimeEnvironmentSchema, [
    "web",
    "api",
  ]);

export const commerceRuntimeEnvironment = (
  credentials: RuntimeCredentials
) => ({
  COMMERCETOOLS_CLIENT_ID: credentials.clientId,
  COMMERCETOOLS_CLIENT_SECRET: credentials.clientSecret,
  COMMERCETOOLS_PROJECT_KEY: credentials.projectKey,
  COMMERCETOOLS_REGION: credentials.region,
  COMMERCETOOLS_SCOPE: credentials.scope,
});
