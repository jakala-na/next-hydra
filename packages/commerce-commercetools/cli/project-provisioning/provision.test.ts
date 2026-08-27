import { describe, expect, it } from "@effect/vitest";
import {
  PrivateDotEnvFileError,
  PrivateDotEnvFileReceipt,
} from "@repo/cli-core/private-dotenv";
import { Effect, Exit, Layer, Redacted } from "effect";

import { CommercetoolsProjectAdministration } from "./administration";
import { BootstrapCommercetoolsConfig } from "./bootstrap-config";
import { RuntimeCredentialHandoff } from "./credential-handoff";
import {
  ApiClientId,
  CommercetoolsRegion,
  PreparedProject,
  ProjectAdministrationError,
  ProjectKey,
  ProjectSeedReceipt,
  RuntimeCredentials,
  RuntimeProjectSetupError,
} from "./model";
import { provisionCommerceProject } from "./provision";
import { RuntimeProjectSetup } from "./runtime-project-setup";
import { runtimeScopeFor } from "./scopes";

const projectKey = ProjectKey.make("test-project");
const bootstrapClientId = ApiClientId.make("bootstrap-client");
const runtimeClientId = ApiClientId.make("runtime-client");
const runtimeCredentials = new RuntimeCredentials({
  clientId: runtimeClientId,
  clientSecret: Redacted.make("runtime-secret", { label: "clientSecret" }),
  projectKey,
  region: CommercetoolsRegion.make("us-central1.gcp"),
  scope: runtimeScopeFor(projectKey),
});
const preparedProject = new PreparedProject({
  projectKey,
  searchIndexingStatus: "Activated",
});
const seedReceipt = new ProjectSeedReceipt({
  migrationsApplied: 2,
});
const credentialFileReceipt = new PrivateDotEnvFileReceipt({
  mode: 0o600,
  path: "/tmp/runtime.env",
});

const bootstrapLayer = Layer.succeed(
  BootstrapCommercetoolsConfig,
  BootstrapCommercetoolsConfig.of({
    apiUrl: "https://api.us-central1.gcp.commercetools.com",
    authUrl: "https://auth.us-central1.gcp.commercetools.com",
    clientId: bootstrapClientId,
    clientSecret: Redacted.make("bootstrap-secret"),
    projectKey,
    region: CommercetoolsRegion.make("us-central1.gcp"),
    scopes: [
      "manage_project_settings:test-project",
      "manage_api_clients:test-project",
    ],
  })
);

const layersFor = (options: {
  readonly events: string[];
  readonly handoffFailure?: boolean;
  readonly revokeFailure?: boolean;
  readonly setupFailure?: boolean;
}) =>
  Layer.mergeAll(
    bootstrapLayer,
    CommercetoolsProjectAdministration.layerFrom({
      createRuntimeClient: ({ name, scope }) =>
        Effect.sync(() => {
          options.events.push(`create:${name}`);
          expect(scope).toBe(runtimeScopeFor(projectKey));
          return runtimeCredentials;
        }),
      deleteApiClient: (clientId) =>
        Effect.suspend(() => {
          options.events.push(`delete:${clientId}`);
          if (options.revokeFailure && clientId === bootstrapClientId) {
            return Effect.fail(
              new ProjectAdministrationError({
                cause: new Error("bootstrap revocation failed"),
                message: "bootstrap revocation failed",
                operation: "deleteApiClient",
              })
            );
          }
          return Effect.void;
        }),
      prepareProject: Effect.sync(() => {
        options.events.push("prepare");
        return preparedProject;
      }),
    }),
    RuntimeProjectSetup.layerFrom({
      setup: () =>
        Effect.suspend(() => {
          options.events.push("setup");
          return options.setupFailure
            ? Effect.fail(
                new RuntimeProjectSetupError({
                  cause: new Error("setup failed"),
                  message: "setup failed",
                  phase: "migrations",
                })
              )
            : Effect.succeed(seedReceipt);
        }),
    }),
    RuntimeCredentialHandoff.layerFrom({
      save: () =>
        Effect.suspend(() => {
          options.events.push("save");
          return options.handoffFailure
            ? Effect.fail(
                new PrivateDotEnvFileError({
                  cause: new Error("handoff failed"),
                  message: "handoff failed",
                  operation: "publish",
                  path: "/tmp/runtime.env",
                })
              )
            : Effect.succeed(credentialFileReceipt);
        }),
    })
  );

const runProvisioning = (layer: ReturnType<typeof layersFor>) =>
  provisionCommerceProject({
    clientName: "test runtime",
    output: "/tmp/runtime.env",
  }).pipe(Effect.provide(layer));

describe(provisionCommerceProject, () => {
  it.effect(
    "commits the runtime credentials before revoking bootstrap access",
    () => {
      const events: string[] = [];

      return Effect.gen(function* () {
        const receipt = yield* runProvisioning(layersFor({ events }));

        expect(events).toStrictEqual([
          "prepare",
          "create:test runtime",
          "setup",
          "save",
          `delete:${bootstrapClientId}`,
        ]);
        expect(receipt).toMatchObject({
          bootstrapClientRevoked: true,
          runtimeClientId,
          scope: runtimeScopeFor(projectKey),
        });
      });
    }
  );

  it.effect("deletes a provisional runtime client when setup fails", () => {
    const events: string[] = [];

    return Effect.gen(function* () {
      const exit = yield* runProvisioning(
        layersFor({ events, setupFailure: true })
      ).pipe(Effect.exit);

      expect(Exit.isFailure(exit)).toBeTruthy();
      expect(events).toStrictEqual([
        "prepare",
        "create:test runtime",
        "setup",
        `delete:${runtimeClientId}`,
      ]);
    });
  });

  it.effect("deletes a provisional runtime client when handoff fails", () => {
    const events: string[] = [];

    return Effect.gen(function* () {
      const exit = yield* runProvisioning(
        layersFor({ events, handoffFailure: true })
      ).pipe(Effect.exit);

      expect(Exit.isFailure(exit)).toBeTruthy();
      expect(events).toStrictEqual([
        "prepare",
        "create:test runtime",
        "setup",
        "save",
        `delete:${runtimeClientId}`,
      ]);
    });
  });

  it.effect(
    "preserves committed runtime credentials when bootstrap revocation fails",
    () => {
      const events: string[] = [];

      return Effect.gen(function* () {
        const exit = yield* runProvisioning(
          layersFor({ events, revokeFailure: true })
        ).pipe(Effect.exit);

        expect(Exit.isFailure(exit)).toBeTruthy();
        expect(events).toStrictEqual([
          "prepare",
          "create:test runtime",
          "setup",
          "save",
          `delete:${bootstrapClientId}`,
        ]);
      });
    }
  );
});
