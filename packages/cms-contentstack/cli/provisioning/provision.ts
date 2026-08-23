import { Console, Effect } from "effect";

import { ContentstackCli } from "./contentstack-cli";
import { CONTENTSTACK_CLI_VERSION } from "./contentstack-cli-live";
import {
  ContentstackCliVersionError,
  ContentstackProvisioningReceipt,
} from "./model";
import type { ContentstackEnvironment } from "./model";
import { ContentstackRecipe } from "./recipe";
import {
  ContentstackRuntimeCredentialHandoff,
  ContentstackRuntimeCredentialInput,
} from "./runtime-credentials";

export interface ProvisionContentstackOptions {
  readonly environment: ContentstackEnvironment;
  readonly localUrl: string;
  readonly managementTokenAlias: string;
  readonly output: string;
  readonly productionUrl: string;
  readonly stackMasterLocale: string;
}

const requireSupportedCliVersion = Effect.fn(
  "ContentstackProvisioning.requireSupportedCliVersion"
)(function* () {
  const cli = yield* ContentstackCli;
  const actual = yield* cli.version();
  const expectedPrefix = `@contentstack/cli/${CONTENTSTACK_CLI_VERSION} `;

  if (actual.startsWith(expectedPrefix)) {
    return yield* Effect.void;
  }

  return yield* new ContentstackCliVersionError({
    actual,
    cause: new Error(
      `Expected Contentstack CLI output to start with ${expectedPrefix}`
    ),
    expected: CONTENTSTACK_CLI_VERSION,
    message: "The installed Contentstack CLI version does not match the recipe",
  });
});

export const provisionContentstack = Effect.fn(
  "ContentstackProvisioning.provision"
)(function* (options: ProvisionContentstackOptions) {
  const cli = yield* ContentstackCli;
  const recipe = yield* ContentstackRecipe;
  const credentialInput = yield* ContentstackRuntimeCredentialInput;
  const handoff = yield* ContentstackRuntimeCredentialHandoff;

  yield* requireSupportedCliVersion();
  const endpoints = yield* cli.runtimeEndpoints();
  const stack = yield* cli.resolveStack(options.managementTokenAlias);
  const recipeReceipt = yield* Effect.scoped(
    Effect.gen(function* () {
      const materialized = yield* recipe.materialize({
        localUrl: options.localUrl,
        productionUrl: options.productionUrl,
        targetMasterLocale: options.stackMasterLocale,
      });
      yield* cli.importRecipe({
        directory: materialized.directory,
        managementTokenAlias: options.managementTokenAlias,
      });
      return materialized;
    })
  );

  yield* Console.log(
    `Create Delivery and Preview Tokens for the ${options.environment} environment if they are not already present.`
  );
  const credentials = yield* credentialInput.acquire(
    stack.apiKey,
    options.environment,
    endpoints
  );
  const credentialFile = yield* handoff.save(credentials, options.output);

  return new ContentstackProvisioningReceipt({
    apiKey: stack.apiKey,
    credentialFile,
    environments: [...recipeReceipt.environments],
    imported: true,
    livePreviewConfigurationRequired: true,
    recipeVersion: recipeReceipt.version,
    region: endpoints.region,
  });
});
