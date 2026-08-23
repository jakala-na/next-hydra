/* oxlint-disable max-classes-per-file -- These small capability services form one runtime-credential boundary. */

import type {
  PrivateDotEnvFileError,
  PrivateDotEnvFileReceipt,
} from "@repo/cli-core/private-dotenv";
import { Context, Layer } from "effect";
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

interface ContentstackRuntimeCredentialHandoffValue {
  readonly save: (
    credentials: ContentstackRuntimeCredentials,
    destination: string
  ) => Effect.Effect<PrivateDotEnvFileReceipt, PrivateDotEnvFileError>;
}

export class ContentstackRuntimeCredentialHandoff extends Context.Service<
  ContentstackRuntimeCredentialHandoff,
  ContentstackRuntimeCredentialHandoffValue
>()("@repo/cms-contentstack/ContentstackRuntimeCredentialHandoff") {
  static readonly layerFrom = (
    value: ContentstackRuntimeCredentialHandoffValue
  ) =>
    Layer.succeed(
      ContentstackRuntimeCredentialHandoff,
      ContentstackRuntimeCredentialHandoff.of(value)
    );
}
