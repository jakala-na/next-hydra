import { NodeServices } from "@effect/platform-node";
import { RuntimeEnvironmentPublisher } from "@repo/cli-core/runtime-environment";
import { Effect, Exit, Layer, Redacted, Stdio } from "effect";
import { TestConsole } from "effect/testing";
import { Command } from "effect/unstable/cli";
import { describe, expect, it } from "vitest";

import { createProjectCommand } from "./commands/project";
import { CommercetoolsProjectAdministration } from "./project-provisioning/administration";
import { BootstrapCommercetoolsConfig } from "./project-provisioning/bootstrap-config";
import {
  ApiClientId,
  CommercetoolsRegion,
  PreparedProject,
  ProjectKey,
  ProjectSeedReceipt,
  RuntimeClientCreationOutcomeUnknown,
  RuntimeCredentials,
} from "./project-provisioning/model";
import { RuntimeProjectSetup } from "./project-provisioning/runtime-project-setup";

async function run(failCreation = false) {
  const requested: string[] = [];
  const projectKey = ProjectKey.make("project-id");
  const region = CommercetoolsRegion.make("us-central1.gcp");
  const layer = Layer.mergeAll(
    Layer.succeed(BootstrapCommercetoolsConfig, {
      apiUrl: "https://api.example.test",
      authUrl: "https://auth.example.test",
      clientId: ApiClientId.make("bootstrap-client"),
      clientSecret: Redacted.make("private-bootstrap"),
      projectKey,
      region,
      scopes: [
        "manage_project_settings:project-id",
        "manage_api_clients:project-id",
      ],
    }),
    CommercetoolsProjectAdministration.layerFrom({
      prepareProject: Effect.succeed(
        new PreparedProject({ projectKey, searchIndexingStatus: "Activated" })
      ),
      createRuntimeClient: ({ name, scope }) =>
        Effect.suspend(() => {
          requested.push(name);
          return failCreation
            ? Effect.fail(
                new RuntimeClientCreationOutcomeUnknown({
                  clientName: name,
                  message: "Creation outcome unknown",
                  cause: new Error("Timeout"),
                })
              )
            : Effect.succeed(
                new RuntimeCredentials({
                  clientId: ApiClientId.make("runtime-client"),
                  clientSecret: Redacted.make("private-runtime", {
                    label: "clientSecret",
                  }),
                  projectKey,
                  region,
                  scope,
                })
              );
        }),
      deleteApiClient: () => Effect.void,
    }),
    RuntimeProjectSetup.layerFrom({
      setup: () =>
        Effect.succeed(new ProjectSeedReceipt({ migrationsApplied: 3 })),
    }),
    RuntimeEnvironmentPublisher.layerFrom({
      prepare: ({ manifest }) =>
        Effect.succeed({
          destination: "local",
          path: "/private/commerce.env",
          manifest,
        }),
      publish: () =>
        Effect.succeed({
          destination: "local",
          path: "/private/commerce.env",
          mode: 0o600,
        }),
    })
  );
  return await Effect.gen(function* () {
    const exit = yield* Command.runWith(
      createProjectCommand(
        Effect.die("No configuration reads expected"),
        layer
      ),
      { version: "0.0.0" }
    )(["provision", "--client-name", "app-client", "--yes"]).pipe(Effect.exit);
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

describe("Commerce provision command output", () => {
  it("prints one framed result with actual project and bootstrap-client outcomes", async () => {
    const output = await run();
    expect(output.exit).toMatchObject({ _tag: "Success" });
    expect(output.stdout.match(/┌─ Commerce · commercetools/gu)).toHaveLength(
      1
    );
    for (const fragment of [
      "Project: project-id",
      "Bootstrap API Client: revoked",
    ]) {
      expect(output.stdout).toContain(fragment);
    }
    expect(output.stdout).not.toContain("\u001B[");
    expect(output.requested).toEqual(["app-client"]);
  });

  it("retains the failure boundary without reporting successful provisioning", async () => {
    const output = await run(true);
    expect(Exit.isFailure(output.exit)).toBeTruthy();
    expect(output.stdout).not.toContain("┌─ Commerce");
    expect(output.stderr).toContain("STOPPED");
  });
});
