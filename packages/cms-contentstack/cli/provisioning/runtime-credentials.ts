/* oxlint-disable max-classes-per-file -- These small capability services form one runtime-credential boundary. */

import { runtimeEnvironmentManifestFromSchema } from "@repo/cli-core/runtime-environment";
import { Context, Layer, Schema } from "effect";
import type { Effect } from "effect";

import type {
  ContentstackApiKey,
  ContentstackCredentialInputError,
  ContentstackEnvironment,
  ContentstackRuntimeEndpoints,
  ContentstackRuntimeCredentials,
} from "./model";

interface ContentstackRuntimeCredentialInputValue {
  readonly acquire: (
    apiKey: ContentstackApiKey,
    environment: ContentstackEnvironment,
    endpoints: ContentstackRuntimeEndpoints
  ) => Effect.Effect<
    ContentstackRuntimeCredentials,
    ContentstackCredentialInputError
  >;
}

export class ContentstackRuntimeCredentialInput extends Context.Service<
  ContentstackRuntimeCredentialInput,
  ContentstackRuntimeCredentialInputValue
>()("@repo/cms-contentstack/ContentstackRuntimeCredentialInput") {
  static readonly layerFrom = (
    value: ContentstackRuntimeCredentialInputValue
  ) =>
    Layer.succeed(
      ContentstackRuntimeCredentialInput,
      ContentstackRuntimeCredentialInput.of(value)
    );
}

const contentstackRuntimeEnvironmentSchema = {
  CONTENTSTACK_API_KEY: Schema.String,
  CONTENTSTACK_DELIVERY_TOKEN: Schema.Redacted(Schema.String),
  CONTENTSTACK_ENVIRONMENT: Schema.String,
  CONTENTSTACK_GRAPHQL_HOST_NAME: Schema.String,
  CONTENTSTACK_LIVE_PREVIEW_HOST_NAME: Schema.String,
  CONTENTSTACK_PREVIEW_TOKEN: Schema.Redacted(Schema.String),
  CONTENTSTACK_REGION: Schema.String,
  CONTENTSTACK_WEBHOOK_SECRET: Schema.Redacted(Schema.String),
  NEXT_PUBLIC_CONTENTSTACK_API_KEY: Schema.String,
  NEXT_PUBLIC_CONTENTSTACK_ENVIRONMENT: Schema.String,
} as const;

export const contentstackRuntimeEnvironmentManifest =
  runtimeEnvironmentManifestFromSchema(contentstackRuntimeEnvironmentSchema, [
    "web",
  ]);

export const contentstackRuntimeEnvironment = (
  credentials: ContentstackRuntimeCredentials
) => ({
  CONTENTSTACK_API_KEY: credentials.apiKey,
  CONTENTSTACK_DELIVERY_TOKEN: credentials.deliveryToken,
  CONTENTSTACK_ENVIRONMENT: credentials.environment,
  CONTENTSTACK_GRAPHQL_HOST_NAME: credentials.graphqlHost,
  CONTENTSTACK_LIVE_PREVIEW_HOST_NAME: credentials.graphqlPreviewHost,
  CONTENTSTACK_PREVIEW_TOKEN: credentials.previewToken,
  CONTENTSTACK_REGION: credentials.region,
  CONTENTSTACK_WEBHOOK_SECRET: credentials.webhookSecret,
  NEXT_PUBLIC_CONTENTSTACK_API_KEY: credentials.apiKey,
  NEXT_PUBLIC_CONTENTSTACK_ENVIRONMENT: credentials.environment,
});
