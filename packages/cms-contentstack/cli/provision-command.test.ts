import { NodeServices } from "@effect/platform-node";
import { RuntimeEnvironmentPublisher } from "@repo/cli-core/runtime-environment";
import { Effect, Exit, Layer, Redacted, Stdio } from "effect";
import { TestConsole } from "effect/testing";
import { Command } from "effect/unstable/cli";
import { describe, expect, it } from "vitest";

import { createCmsCommand } from "./index";
import { ContentstackMigrationLedger } from "./migrations/ledger";
import { ContentstackCli } from "./provisioning/contentstack-cli";
import { CONTENTSTACK_CLI_VERSION } from "./provisioning/contentstack-cli-live";
import {
  ContentstackApiKey,
  ContentstackRecipeReceipt,
  ContentstackRuntimeCredentials,
  ContentstackRuntimeEndpoints,
  ContentstackStack,
} from "./provisioning/model";
import { ContentstackRecipe } from "./provisioning/recipe";
import { ContentstackRuntimeCredentialInput } from "./provisioning/runtime-credentials";

async function run(version = CONTENTSTACK_CLI_VERSION) {
  const requested: string[] = [];
  const endpoints = new ContentstackRuntimeEndpoints({
    graphqlHost: "eu-graphql.contentstack.com",
    graphqlPreviewHost: "eu-graphql-preview.contentstack.com",
    region: "EU",
  });
  const apiKey = ContentstackApiKey.make("stack-id");
  const layer = Layer.mergeAll(
    ContentstackCli.layerFrom({
      version: () =>
        Effect.succeed(`@contentstack/cli/${version} test-platform node-test`),
      resolveStack: (managementTokenAlias) =>
        Effect.sync(() => {
          requested.push(managementTokenAlias);
          return new ContentstackStack({
            apiKey,
            managementTokenAlias,
            managementToken: Redacted.make("private-token"),
          });
        }),
      runtimeEndpoints: () => Effect.succeed(endpoints),
      importRecipe: () => Effect.void,
      runMigration: () => Effect.void,
    }),
    ContentstackRecipe.layerFrom({
      materialize: ({ productionUrl }) =>
        Effect.sync(() => {
          requested.push(productionUrl);
          return new ContentstackRecipeReceipt({
            directory: "/private/recipe",
            environments: ["development"],
            version: "4",
          });
        }),
    }),
    ContentstackMigrationLedger.layerFrom({
      open: () =>
        Effect.succeed({
          applied: () => Effect.succeed([]),
          record: () => Effect.void,
        }),
    }),
    ContentstackRuntimeCredentialInput.layerFrom({
      acquire: (_key, environment) =>
        Effect.succeed(
          new ContentstackRuntimeCredentials({
            apiKey,
            environment,
            graphqlHost: endpoints.graphqlHost,
            graphqlPreviewHost: endpoints.graphqlPreviewHost,
            region: endpoints.region,
            deliveryToken: Redacted.make("private-delivery"),
            previewToken: Redacted.make("private-preview"),
            webhookSecret: Redacted.make("private-webhook"),
          })
        ),
    }),
    RuntimeEnvironmentPublisher.layerFrom({
      prepare: ({ manifest }) =>
        Effect.succeed({
          destination: "local",
          path: "/private/cms.env",
          manifest,
        }),
      publish: () =>
        Effect.succeed({
          destination: "local",
          mode: 0o600,
          path: "/private/cms.env",
        }),
    })
  );
  return await Effect.gen(function* () {
    const exit = yield* Command.runWith(
      createCmsCommand(Effect.die("No configuration reads expected"), layer),
      { version: "0.0.0" }
    )([
      "provision",
      "--management-token-alias",
      "stack-alias",
      "--production-url",
      "https://shop.example.test",
      "--yes",
    ]).pipe(Effect.exit);
    return {
      exit,
      requested,
      stdout: (yield* TestConsole.logLines).join("\n"),
      stderr: (yield* TestConsole.errorLines).join("\n"),
    };
  }).pipe(
    Effect.provide(
      Layer.mergeAll(
        NodeServices.layer,
        TestConsole.layer,
        Stdio.layerTest({ stdoutIsTerminal: Effect.succeed(false) })
      )
    ),
    Effect.runPromise
  );
}

describe("Contentstack provision command output", () => {
  it("prints one framed result using explicit command inputs and the provisioning receipt", async () => {
    const output = await run();
    expect(Exit.isSuccess(output.exit)).toBeTruthy();
    expect(output.stdout.match(/┌─ CMS · Contentstack/gu)).toHaveLength(1);
    for (const fragment of [
      "https://shop.example.test",
      "Migrations applied: 1",
    ]) {
      expect(output.stdout).toContain(fragment);
    }
    expect(output.stdout).not.toContain("\u001B[");
    expect(output.requested).toEqual([
      "stack-alias",
      "https://shop.example.test",
    ]);
  });

  it("does not print a success receipt when provisioning stops", async () => {
    const output = await run("1.99.0");
    expect(Exit.isFailure(output.exit)).toBeTruthy();
    expect(output.stdout).not.toContain("┌─ CMS");
    expect(output.stderr).toContain("STOPPED");
  });
});
