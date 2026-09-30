import type {
  InstallContentSearchAppOptions,
  InstalledContentSearchApp,
} from "@repo/search/content-search-app";
import { Cause, Config, ConfigProvider, Effect, Redacted } from "effect";
import { CliOutput } from "effect/unstable/cli";
import { describe, expect, it } from "vitest";

import {
  contentSearchAppConfigProvider,
  requireContentSearchAppHook,
} from "./content-search-app-hook";
import { searchCliError } from "./error-message";
import { AlgoliaProvisioningError } from "./provisioning/model";

const renderSearchError = (cause: Error) =>
  CliOutput.defaultFormatter({ colors: false }).formatError(
    searchCliError(Cause.fail(cause))
  );

describe("search command errors", () => {
  it("shows the provider cause without dumping provider credentials", () => {
    const providerError = Object.assign(
      new Error("The API key does not have access to this operation"),
      {
        correlationId: "request-123",
        error: {
          code: "forbidden",
          details: [
            {
              label: "apiKey",
              message: "Add the required Ingestion API access",
            },
          ],
        },
        headers: {
          "x-algolia-api-key": "secret-admin-key",
        },
        status: 403,
      }
    );
    const provisioningError = new AlgoliaProvisioningError({
      cause: providerError,
      message: "Algolia destination authentication creation failed",
      operation: "destination authentication creation",
    });

    const output = renderSearchError(provisioningError);

    expect(output).toContain(
      "Algolia destination authentication creation failed"
    );
    expect(output).toContain(
      "The API key does not have access to this operation"
    );
    expect(output).not.toContain("secret-admin-key");
  });
});

const hook = (
  options: InstallContentSearchAppOptions
): Effect.Effect<InstalledContentSearchApp> =>
  Effect.succeed({
    environment: "production",
    indexName: options.indexName,
    installationUid: "installation-id",
    status: "installed",
  });

describe(requireContentSearchAppHook, () => {
  it("delivers the new write key to CMS installation while preserving CMS configuration", async () => {
    const provider = contentSearchAppConfigProvider(
      {
        ALGOLIA_APPLICATION_ID: "new-app",
        ALGOLIA_CONTENT_INDEX_NAME: "staging--content",
        ALGOLIA_CONTENT_WRITE_API_KEY: Redacted.make("generated-write-key"),
      },
      ConfigProvider.fromUnknown({
        ALGOLIA_APPLICATION_ID: "old-app",
        ALGOLIA_CONTENT_WRITE_API_KEY: "old-key",
        CONTENTSTACK_ENVIRONMENT: "staging",
      })
    );
    const config = await Effect.gen(function* () {
      return {
        applicationId: yield* Config.NonEmptyString("ALGOLIA_APPLICATION_ID"),
        environment: yield* Config.NonEmptyString("CONTENTSTACK_ENVIRONMENT"),
        key: yield* Config.Redacted("ALGOLIA_CONTENT_WRITE_API_KEY"),
      };
    }).pipe(Effect.provide(ConfigProvider.layer(provider)), Effect.runPromise);
    expect(config.applicationId).toBe("new-app");
    expect(Redacted.value(config.key)).toBe("generated-write-key");
    expect(config.environment).toBe("staging");
    expect(JSON.stringify(config)).not.toContain("generated-write-key");
  });

  it("fails clearly when the CMS provider supplies no hook", async () => {
    const failure = await requireContentSearchAppHook(undefined).pipe(
      Effect.flip,
      Effect.runPromise
    );

    expect(failure).toBeInstanceOf(AlgoliaProvisioningError);
    expect(failure.operation).toBe("content search app installation");
    expect(failure.message).toContain(
      "not supported for the selected CMS provider"
    );
  });

  it("returns the composed hook unchanged", async () => {
    await expect(
      requireContentSearchAppHook(hook).pipe(Effect.runPromise)
    ).resolves.toBe(hook);
  });
});
