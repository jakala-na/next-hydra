import { NodeServices } from "@effect/platform-node";
import {
  RuntimeEnvironmentPublicationError,
  RuntimeEnvironmentPublisher,
} from "@repo/cli-core/runtime-environment";
import { createCanonicalContentSearchProjection } from "@repo/search/content-search-projection";
import {
  Config,
  ConfigProvider,
  Effect,
  Exit,
  Layer,
  Redacted,
  Stdio,
} from "effect";
import * as TestConsole from "effect/testing/TestConsole";
import { Command } from "effect/unstable/cli";
import { beforeEach, describe, expect, it } from "vitest";

import type { ContentIndexingHandoffContext } from "./content-indexing-handoff";
import { createSearchCommand } from "./index";
import { AlgoliaAdministration } from "./provisioning/administration";
import { AlgoliaProvisioningConfig } from "./provisioning/config";

const storeConfiguration = [
  { storeKey: "us", locale: "en-US", currency: "USD", isDefault: true },
];

interface TestState {
  failPublication: boolean;
  writes: number;
  appCalls: number;
  installedKey: string;
  handoffs: ContentIndexingHandoffContext[];
}
const state: TestState = {
  failPublication: false,
  writes: 0,
  appCalls: 0,
  installedKey: "",
  handoffs: [],
};

const provisioningLayer = () =>
  Layer.mergeAll(
    Layer.succeed(AlgoliaProvisioningConfig, {
      applicationId: "app-123",
      adminApiKey: Redacted.make("private-admin-key"),
      region: "us",
    }),
    AlgoliaAdministration.layerFrom({
      configureIndex: () =>
        Effect.sync(() => {
          state.writes += 1;
        }),
      configureQuerySuggestions: () => Effect.void,
      configureContentKey: () =>
        Effect.succeed(Redacted.make("private-content-key")),
      configureSearchKey: () =>
        Effect.succeed(Redacted.make("private-search-key")),
      configureConnectorKey: () => Effect.die("Unused commerce operation"),
      configureAlgoliaDestinationAuthentication: () =>
        Effect.die("Unused commerce operation"),
      configureAlgoliaTransformationSecrets: () =>
        Effect.die("Unused commerce operation"),
      configureCommercetoolsAuthentication: () =>
        Effect.die("Unused commerce operation"),
      configureCommercetoolsConnector: () =>
        Effect.die("Unused commerce operation"),
      findCommercetoolsAuthentication: () =>
        Effect.die("Unused commerce operation"),
    }),
    RuntimeEnvironmentPublisher.layerFrom({
      prepare: ({ destination, manifest }) => {
        if (destination.destination === "local") {
          return Effect.succeed({
            destination: "local" as const,
            path: destination.output,
            manifest,
          });
        }
        return Effect.succeed({
          destination: "vercel" as const,
          manifest,
          environments: destination.environments,
          projects: [],
          publicationMode: destination.publicationMode,
        });
      },
      publish: (prepared) => {
        if (state.failPublication) {
          return Effect.fail(
            new RuntimeEnvironmentPublicationError({
              cause: new Error("unavailable"),
              destination: prepared.destination,
              message: "Could not publish credentials",
            })
          );
        }
        if (prepared.destination === "local") {
          return Effect.succeed({
            destination: "local" as const,
            path: prepared.path,
            mode: 0o600,
          });
        }
        return Effect.succeed({
          destination: "vercel" as const,
          environments: prepared.environments,
          projects: [],
          publicationMode: prepared.publicationMode,
          deploymentRequired: true as const,
        });
      },
    })
  );

function command(hasCommerce = false) {
  return createSearchCommand(
    Effect.succeed(ConfigProvider.fromUnknown({})),
    {
      products: hasCommerce
        ? {
            storefronts: storeConfiguration,
            prepare: () =>
              Effect.succeed({
                storefronts: storeConfiguration,
                priceCustomerGroupIds: [],
                provision: () => Effect.succeed({ connectors: 1 }),
              }),
            generateTypes: () => Effect.void,
          }
        : undefined,
      content: {
        indexingOperations: ["search", "upsert", "delete"],
        createProjection: (indexName) =>
          Effect.succeed(createCanonicalContentSearchProjection(indexName)),
        createIndexingHandoff: (_indexName, context) => {
          state.handoffs.push(context);
          return {
            title: "CMS indexing",
            tasks: [
              ...(context.appInstalled
                ? []
                : [
                    {
                      id: "cms.configure",
                      title: "Configure the CMS app",
                      where: "CMS > app",
                      detail: `Read credentials from ${context.credentialsLocation}.`,
                    },
                  ]),
              {
                id: "cms.sync",
                title: "Run the initial content sync",
                where: "CMS > app",
                detail: "Start the initial sync.",
              },
            ],
          };
        },
        installContentSearchApp: (options, provider) =>
          Effect.gen(function* () {
            state.appCalls += 1;
            const key = yield* Config.Redacted(
              "ALGOLIA_CONTENT_WRITE_API_KEY"
            ).pipe(Effect.provide(ConfigProvider.layer(provider)));
            state.installedKey = Redacted.value(key);
            return {
              status: "installed" as const,
              indexName: options.indexName,
              environment: "production",
              installationUid: "app-456",
              configuredMappings: [
                { contentTypeUid: "page", fields: ["title"] },
              ],
            };
          }),
      },
    },
    provisioningLayer
  );
}

async function run(args: string[], hasCommerce = false) {
  return await Effect.gen(function* () {
    const exit = yield* Command.runWith(command(hasCommerce), {
      version: "test",
      renderErrors: false,
    })([
      "provision",
      "--locale",
      "en-US",
      "--index-prefix",
      "demo",
      "--output",
      "search.env",
      "--yes",
      ...args,
    ]).pipe(Effect.exit);
    return {
      exit,
      stdout: (yield* TestConsole.logLines).join("\n"),
      stderr: (yield* TestConsole.errorLines).join("\n"),
    };
  }).pipe(
    Effect.provide(
      Layer.mergeAll(NodeServices.layer, Stdio.layerTest({}), TestConsole.layer)
    ),
    Effect.runPromise
  );
}

describe("composed search provision output", () => {
  beforeEach(() => {
    state.failPublication = false;
    state.writes = 0;
    state.appCalls = 0;
    state.installedKey = "";
    state.handoffs.length = 0;
  });

  it("prints one combined receipt and contextual provider tasks for manual CMS setup", async () => {
    const output = await run([], true);
    expect(Exit.isSuccess(output.exit)).toBeTruthy();
    expect(output.stdout.match(/Your next steps/gu)).toHaveLength(1);
    for (const fragment of [
      "Configure the CMS app",
      "Apply the runtime configuration",
      "apps/web",
    ]) {
      expect(output.stdout).toContain(fragment);
    }
    expect(output.stdout.replaceAll(/\s+/gu, " ")).toContain(
      "Load the required runtime variables from search.env"
    );
    for (const fragment of [
      "Initial reindexes completed: 1",
      "Verify product and content search together",
    ]) {
      expect(output.stdout).toContain(fragment);
    }
    expect(state.handoffs).toEqual([
      { appInstalled: false, credentialsLocation: "search.env" },
    ]);
  });

  it("removes completed app setup while retaining sync and keeping generated keys private", async () => {
    const output = await run(["--install-content-search-app"]);
    expect(Exit.isSuccess(output.exit)).toBeTruthy();
    expect({
      calls: state.appCalls,
      key: state.installedKey,
      mappings: state.handoffs[0]?.configuredMappings,
    }).toEqual({
      calls: 1,
      key: "private-content-key",
      mappings: [{ contentTypeUid: "page", fields: ["title"] }],
    });
    expect(output.stdout).not.toContain("Configure the CMS app");
    for (const fragment of [
      "Apply the runtime configuration",
      "apps/web",
      "restart or redeploy them",
      "Run the initial content sync",
      "installed (app-456)",
      "Content mappings applied: page",
    ]) {
      expect(output.stdout.replaceAll(/\s+/gu, " ")).toContain(fragment);
    }
    for (const secret of [
      "private-content-key",
      "private-admin-key",
      "private-search-key",
    ]) {
      expect(output.stdout + output.stderr).not.toContain(secret);
    }
  });

  it("renders a structured dry run without provisioning or installing the CMS app", async () => {
    const output = await run(["--dry-run", "--install-content-search-app"]);
    expect(Exit.isSuccess(output.exit)).toBeTruthy();
    for (const fragment of ["DRY RUN", "demo--content"]) {
      expect(output.stdout).toContain(fragment);
    }
    expect(output.stdout).not.toContain("ACTION REQUIRED");
    expect(state.writes).toBe(0);
    expect(state.appCalls).toBe(0);
  });

  it("reports publication failure without a completion receipt or CMS installation", async () => {
    state.failPublication = true;
    const output = await run(["--install-content-search-app"]);
    expect({
      failed: Exit.isFailure(output.exit),
      wrote: state.writes > 0,
      appCalls: state.appCalls,
    }).toEqual({ failed: true, wrote: true, appCalls: 0 });
    expect(output.stderr).toContain(
      "FAIL  Search · Publish search and content credentials"
    );
    expect(output.stderr).toContain("STOPPED  Set up search");
    expect(output.stdout).toBe("");
  });
});
