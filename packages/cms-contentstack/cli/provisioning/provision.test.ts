import { describe, expect, it } from "@effect/vitest";
import { PrivateDotEnvFileReceipt } from "@repo/cli-core/private-dotenv";
import { Effect, Layer, Redacted, Schema } from "effect";

import { ContentstackCli } from "./contentstack-cli";
import { CONTENTSTACK_CLI_VERSION } from "./contentstack-cli-live";
import {
  ContentstackApiKey,
  ContentstackCliVersionError,
  ContentstackRecipeReceipt,
  ContentstackRuntimeEndpoints,
  ContentstackRuntimeCredentials,
  ContentstackStack,
} from "./model";
import { provisionContentstack } from "./provision";
import { ContentstackRecipe } from "./recipe";
import {
  ContentstackRuntimeCredentialHandoff,
  ContentstackRuntimeCredentialInput,
} from "./runtime-credentials";

const apiKey = ContentstackApiKey.make("blt-api-key");
const endpoints = new ContentstackRuntimeEndpoints({
  graphqlHost: "eu-graphql.contentstack.com",
  graphqlPreviewHost: "eu-graphql-preview.contentstack.com",
  region: "EU",
});
const credentials = new ContentstackRuntimeCredentials({
  apiKey,
  deliveryToken: Redacted.make("cs-delivery"),
  environment: "development",
  graphqlHost: endpoints.graphqlHost,
  graphqlPreviewHost: endpoints.graphqlPreviewHost,
  previewToken: Redacted.make("cs-preview"),
  region: endpoints.region,
  webhookSecret: Redacted.make("webhook-secret"),
});
const credentialFile = new PrivateDotEnvFileReceipt({
  mode: 0o600,
  path: "/tmp/contentstack.env",
});

const options = {
  environment: "development",
  localUrl: "http://localhost:3001",
  managementTokenAlias: "next-hydra-bootstrap",
  output: "/tmp/contentstack.env",
  productionUrl: "https://store.example.com",
  stackMasterLocale: "en-us",
} as const;

const layersFor = (events: string[], version = CONTENTSTACK_CLI_VERSION) =>
  Layer.mergeAll(
    ContentstackCli.layerFrom({
      importRecipe: ({ directory }) =>
        Effect.sync(() => {
          events.push(`import:${directory}`);
        }),
      resolveStack: (managementTokenAlias) =>
        Effect.sync(() => {
          events.push(`resolve:${managementTokenAlias}`);
          return new ContentstackStack({
            apiKey,
            managementTokenAlias,
          });
        }),
      runtimeEndpoints: () =>
        Effect.sync(() => {
          events.push("region");
          return endpoints;
        }),
      version: () =>
        Effect.sync(() => {
          events.push("version");
          return `@contentstack/cli/${version} test-platform node-test`;
        }),
    }),
    ContentstackRecipe.layerFrom({
      materialize: ({ localUrl, productionUrl, targetMasterLocale }) =>
        Effect.sync(() => {
          expect(targetMasterLocale).toBe("en-us");
          events.push(`recipe:${localUrl}:${productionUrl}`);
          return new ContentstackRecipeReceipt({
            directory: "/tmp/recipe",
            environments: ["development", "production"],
            version: "1",
          });
        }),
    }),
    ContentstackRuntimeCredentialInput.layerFrom({
      acquire: (_apiKey, environment, runtimeEndpoints) =>
        Effect.sync(() => {
          events.push(`credentials:${environment}`);
          expect(runtimeEndpoints).toBe(endpoints);
          return credentials;
        }),
    }),
    ContentstackRuntimeCredentialHandoff.layerFrom({
      save: (_credentials, destination) =>
        Effect.sync(() => {
          events.push(`save:${destination}`);
          return credentialFile;
        }),
    })
  );

describe(provisionContentstack, () => {
  it.effect("imports and commits credentials in order", () => {
    const events: string[] = [];

    return Effect.gen(function* () {
      const receipt = yield* provisionContentstack(options).pipe(
        Effect.provide(layersFor(events))
      );

      expect(events).toStrictEqual([
        "version",
        "region",
        "resolve:next-hydra-bootstrap",
        "recipe:http://localhost:3001:https://store.example.com",
        "import:/tmp/recipe",
        "credentials:development",
        "save:/tmp/contentstack.env",
      ]);
      expect(receipt).toMatchObject({
        apiKey,
        credentialFile,
        environments: ["development", "production"],
        imported: true,
        livePreviewConfigurationRequired: true,
        region: "EU",
      });
    });
  });

  it.effect("stops before alias resolution when the CLI version drifts", () => {
    const events: string[] = [];

    return Effect.gen(function* () {
      const error = yield* provisionContentstack(options).pipe(
        Effect.provide(layersFor(events, "1.99.0")),
        Effect.flip
      );

      expect(Schema.is(ContentstackCliVersionError)(error)).toBeTruthy();
      expect(error.cause).toBeDefined();
      expect(events).toStrictEqual(["version"]);
    });
  });
});
