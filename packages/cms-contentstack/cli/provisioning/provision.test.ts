import { NodeServices } from "@effect/platform-node";
import { describe, expect, it } from "@effect/vitest";
import {
  LocalRuntimeEnvironmentPublicationReceipt,
  RuntimeEnvironmentPublisher,
} from "@repo/cli-core/runtime-environment";
import { Effect, Layer, Redacted, Schema } from "effect";

import { ContentstackMigrationLedger } from "../migrations/ledger";
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
import { ContentstackRuntimeCredentialInput } from "./runtime-credentials";

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
const credentialReceipt = new LocalRuntimeEnvironmentPublicationReceipt({
  destination: "local",
  mode: 0o600,
  path: "/tmp/contentstack.env",
});

const options = {
  destination: {
    destination: "local",
    output: "/tmp/contentstack.env",
    publicationMode: "create",
    yes: true,
  },
  environment: "development",
  localUrl: "https://web.next-hydra.localhost",
  managementTokenAlias: "next-hydra-bootstrap",
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
            managementToken: Redacted.make("management-token"),
            managementTokenAlias,
          });
        }),
      runMigration: ({ file }) =>
        Effect.sync(() => {
          events.push(`migrate:${file}`);
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
            version: "2",
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
    RuntimeEnvironmentPublisher.layerFrom({
      prepare: ({ manifest }) =>
        Effect.sync(() => {
          events.push("preflight");
          expect(
            manifest.every(
              ({ applications }) =>
                applications.length === 1 && applications[0] === "web"
            )
          ).toBeTruthy();
          return {
            destination: "local" as const,
            manifest,
            path: "/tmp/contentstack.env",
          };
        }),
      publish: () =>
        Effect.sync(() => {
          events.push("save:/tmp/contentstack.env");
          return credentialReceipt;
        }),
    }),
    ContentstackMigrationLedger.layerFrom({
      open: () =>
        Effect.succeed({
          applied: () => Effect.succeed([]),
          record: (migration) =>
            Effect.sync(() => {
              events.push(`record:${migration.key}`);
            }),
        }),
    }),
    NodeServices.layer
  );

describe(provisionContentstack, () => {
  it.effect("imports and commits credentials in order", () => {
    const events: string[] = [];

    return Effect.gen(function* () {
      const receipt = yield* provisionContentstack(options).pipe(
        Effect.provide(layersFor(events))
      );

      expect(events).toStrictEqual([
        "preflight",
        "version",
        "region",
        "resolve:next-hydra-bootstrap",
        "recipe:https://web.next-hydra.localhost:https://store.example.com",
        "import:/tmp/recipe",
        expect.stringMatching(/migrate:.*seo-fields\.js$/u),
        "record:2026-08-23-120000-add-landing-page-seo-fields",
        "credentials:development",
        "save:/tmp/contentstack.env",
      ]);
      expect(receipt).toMatchObject({
        apiKey,
        credentials: credentialReceipt,
        environments: ["development", "production"],
        imported: true,
        livePreviewConfigurationRequired: true,
        migrationsApplied: 1,
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
      expect(events).toStrictEqual(["preflight", "version"]);
    });
  });
});
