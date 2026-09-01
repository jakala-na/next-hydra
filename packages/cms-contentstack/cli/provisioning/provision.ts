import { RuntimeEnvironmentPublisher } from "@repo/cli-core/runtime-environment";
import type { RuntimeEnvironmentDestination } from "@repo/cli-core/runtime-environment";
import { Console, Effect } from "effect";

import { applyContentstackMigrations } from "../migrations/migrate";
import { ContentstackCli } from "./contentstack-cli";
import { ContentstackProvisioningReceipt } from "./model";
import type { ContentstackEnvironment } from "./model";
import { ContentstackRecipe } from "./recipe";
import { requireSupportedContentstackCliVersion } from "./require-cli-version";
import {
  ContentstackRuntimeCredentialInput,
  contentstackRuntimeEnvironment,
  contentstackRuntimeEnvironmentManifest,
} from "./runtime-credentials";

export interface ProvisionContentstackOptions {
  readonly environment: ContentstackEnvironment;
  readonly localUrl: string;
  readonly managementTokenAlias: string;
  readonly destination: RuntimeEnvironmentDestination;
  readonly productionUrl: string;
  readonly stackMasterLocale: string;
}

export const provisionContentstack = Effect.fn(
  "ContentstackProvisioning.provision"
)(function* (options: ProvisionContentstackOptions) {
  const cli = yield* ContentstackCli;
  const recipe = yield* ContentstackRecipe;
  const credentialInput = yield* ContentstackRuntimeCredentialInput;
  const publisher = yield* RuntimeEnvironmentPublisher;

  const preparedDestination = yield* publisher.prepare({
    destination: options.destination,
    manifest: contentstackRuntimeEnvironmentManifest,
  });

  yield* requireSupportedContentstackCliVersion();
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
  const migrationReceipt = yield* applyContentstackMigrations({
    region: endpoints.region,
    stack,
  });

  yield* Console.log(
    `Create Delivery and Preview Tokens for the ${options.environment} environment if they are not already present.`
  );
  const credentials = yield* credentialInput.acquire(
    stack.apiKey,
    options.environment,
    endpoints
  );
  const publishedCredentials = yield* publisher.publish(
    preparedDestination,
    contentstackRuntimeEnvironment(credentials)
  );

  return new ContentstackProvisioningReceipt({
    apiKey: stack.apiKey,
    credentials: publishedCredentials,
    environments: [...recipeReceipt.environments],
    imported: true,
    livePreviewConfigurationRequired: true,
    migrationsApplied: migrationReceipt.applied.length,
    recipeVersion: recipeReceipt.version,
    region: endpoints.region,
  });
});
