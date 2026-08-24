import { describe, expect, it } from "@effect/vitest";
import {
  LocalRuntimeEnvironmentPublicationReceipt,
  RuntimeEnvironmentPreflightError,
  RuntimeEnvironmentPublicationError,
  RuntimeEnvironmentPublicationIncomplete,
  RuntimeEnvironmentPublicationOutcomeUnknown,
  RuntimeEnvironmentPublisher,
} from "@repo/cli-core/runtime-environment";
import { Effect, Exit, Layer, Redacted } from "effect";

import { CommercetoolsProjectAdministration } from "./administration";
import { BootstrapCommercetoolsConfig } from "./bootstrap-config";
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
const credentialReceipt = new LocalRuntimeEnvironmentPublicationReceipt({
  destination: "local",
  mode: 0o600,
  path: "/tmp/runtime.env",
});

const bootstrapLayer = Layer.succeed(
  BootstrapCommercetoolsConfig,
  BootstrapCommercetoolsConfig.of({
    clientId: bootstrapClientId,
    clientSecret: Redacted.make("bootstrap-secret"),
    projectKey,
    region: CommercetoolsRegion.make("us-central1.gcp"),
  })
);

const layersFor = (options: {
  readonly events: string[];
  readonly handoffFailure?: boolean;
  readonly handoffIncomplete?: boolean;
  readonly handoffOutcomeUnknown?: boolean;
  readonly preflightFailure?: boolean;
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
    RuntimeEnvironmentPublisher.layerFrom({
      prepare: ({ manifest }) =>
        Effect.suspend(() => {
          options.events.push("preflight");
          expect(
            manifest.every(
              ({ applications }) =>
                applications.includes("web") && applications.includes("api")
            )
          ).toBeTruthy();
          return options.preflightFailure
            ? Effect.fail(
                new RuntimeEnvironmentPreflightError({
                  cause: new Error("preflight failed"),
                  destination: "local",
                  message: "preflight failed",
                  operation: "validation",
                })
              )
            : Effect.succeed({
                destination: "local" as const,
                manifest,
                path: "/tmp/runtime.env",
              });
        }),
      publish: () =>
        Effect.suspend(
          (): Effect.Effect<
            LocalRuntimeEnvironmentPublicationReceipt,
            | RuntimeEnvironmentPublicationError
            | RuntimeEnvironmentPublicationIncomplete
            | RuntimeEnvironmentPublicationOutcomeUnknown
          > => {
            options.events.push("save");
            if (options.handoffOutcomeUnknown) {
              return Effect.fail(
                new RuntimeEnvironmentPublicationOutcomeUnknown({
                  cause: new Error("handoff outcome unknown"),
                  destination: "vercel",
                  message: "handoff outcome unknown",
                })
              );
            }
            if (options.handoffIncomplete) {
              return Effect.fail(
                new RuntimeEnvironmentPublicationIncomplete({
                  cause: new Error("handoff incomplete"),
                  destination: "vercel",
                  failedApplication: "api",
                  message: "handoff incomplete",
                  publishedApplications: ["web"],
                })
              );
            }
            return options.handoffFailure
              ? Effect.fail(
                  new RuntimeEnvironmentPublicationError({
                    cause: new Error("handoff failed"),
                    destination: "local",
                    message: "handoff failed",
                  })
                )
              : Effect.succeed(credentialReceipt);
          }
        ),
    })
  );

const runProvisioning = (layer: ReturnType<typeof layersFor>) =>
  provisionCommerceProject({
    clientName: "test runtime",
    destination: {
      destination: "local",
      output: "/tmp/runtime.env",
      publicationMode: "create",
      yes: true,
    },
  }).pipe(Effect.provide(layer));

describe(provisionCommerceProject, () => {
  it.effect("preflights the destination before mutating the project", () => {
    const events: string[] = [];

    return Effect.gen(function* () {
      const exit = yield* runProvisioning(
        layersFor({ events, preflightFailure: true })
      ).pipe(Effect.exit);

      expect(Exit.isFailure(exit)).toBeTruthy();
      expect(events).toStrictEqual(["preflight"]);
    });
  });

  it.effect(
    "commits the runtime credentials before revoking bootstrap access",
    () => {
      const events: string[] = [];

      return Effect.gen(function* () {
        const receipt = yield* runProvisioning(layersFor({ events }));

        expect(events).toStrictEqual([
          "preflight",
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
        "preflight",
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
        "preflight",
        "prepare",
        "create:test runtime",
        "setup",
        "save",
        `delete:${runtimeClientId}`,
      ]);
    });
  });

  it.effect(
    "preserves the runtime client when publication outcome is unknown",
    () => {
      const events: string[] = [];

      return Effect.gen(function* () {
        const exit = yield* runProvisioning(
          layersFor({ events, handoffOutcomeUnknown: true })
        ).pipe(Effect.exit);

        expect(Exit.isFailure(exit)).toBeTruthy();
        expect(events).toStrictEqual([
          "preflight",
          "prepare",
          "create:test runtime",
          "setup",
          "save",
        ]);
      });
    }
  );

  it.effect(
    "preserves the runtime client when publication is incomplete",
    () => {
      const events: string[] = [];

      return Effect.gen(function* () {
        const exit = yield* runProvisioning(
          layersFor({ events, handoffIncomplete: true })
        ).pipe(Effect.exit);

        expect(Exit.isFailure(exit)).toBeTruthy();
        expect(events).toStrictEqual([
          "preflight",
          "prepare",
          "create:test runtime",
          "setup",
          "save",
        ]);
      });
    }
  );

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
          "preflight",
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
