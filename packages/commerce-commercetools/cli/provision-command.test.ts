import { NodeServices } from "@effect/platform-node";
import { Effect, Exit, Stdio } from "effect";
import { TestConsole } from "effect/testing";
import { Command } from "effect/unstable/cli";
import { describe, expect, it, vi } from "vitest";

import { createProjectCommand } from "./commands/project";
import {
  ApiClientId,
  PreparedProject,
  ProjectKey,
  ProjectSeedReceipt,
  ProvisioningReceipt,
  RuntimeClientCreationOutcomeUnknown,
} from "./project-provisioning/model";
import { provisionCommerceProject } from "./project-provisioning/provision";

vi.mock("./layer", async () => {
  const { Layer } = await import("effect");
  return {
    createProjectProvisioningCliLayer: () => Layer.empty,
    createCommerceCliLayer: () => Layer.empty,
  };
});
vi.mock("./project-provisioning/provision", () => ({
  provisionCommerceProject: vi.fn(),
}));

async function run() {
  return Effect.gen(function* () {
    const exit = yield* Command.runWith(
      createProjectCommand(Effect.die("No configuration reads expected")),
      { version: "0.0.0" }
    )(["provision", "--client-name", "app-client", "--yes"]).pipe(Effect.exit);
    return {
      exit,
      stdout: (yield* TestConsole.logLines).join("\n"),
      stderr: (yield* TestConsole.errorLines).join("\n"),
    };
  }).pipe(
    Effect.provide(NodeServices.layer),
    Effect.provide(TestConsole.layer),
    Effect.provide(
      Stdio.layerTest({ stdoutIsTerminal: Effect.succeed(false) })
    ),
    Effect.runPromise
  );
}

describe("Commerce provision command output", () => {
  it("prints one framed result with actual project and bootstrap-client outcomes", async () => {
    vi.mocked(provisionCommerceProject).mockReturnValue(
      Effect.succeed(
        new ProvisioningReceipt({
          bootstrapClientRevoked: true,
          credentials: {
            destination: "local",
            mode: 0o600,
            path: "/private/commerce.env",
          },
          project: new PreparedProject({
            projectKey: ProjectKey.make("project-id"),
            searchIndexingStatus: "Activated",
          }),
          runtimeClientId: ApiClientId.make("runtime-client"),
          scope: "scope",
          seed: new ProjectSeedReceipt({ migrationsApplied: 3 }),
        })
      )
    );
    const output = await run();
    expect(Exit.isSuccess(output.exit)).toBe(true);
    expect(output.stdout.match(/┌─ Commerce · commercetools/gu)).toHaveLength(
      1
    );
    expect(output.stdout).toContain("Project: project-id");
    expect(output.stdout).toContain("Bootstrap API Client: revoked");
    expect(output.stdout).not.toContain("\u001b[");
    expect(
      vi.mocked(provisionCommerceProject).mock.lastCall?.[0]
    ).toMatchObject({ clientName: "app-client" });
  });

  it("retains the failure boundary without reporting successful provisioning", async () => {
    vi.mocked(provisionCommerceProject).mockReturnValue(
      Effect.fail(
        new RuntimeClientCreationOutcomeUnknown({
          clientName: "app-client",
          message: "Creation outcome unknown",
          cause: new Error("Timeout"),
        })
      )
    );
    const output = await run();
    expect(Exit.isFailure(output.exit)).toBe(true);
    expect(output.stdout).not.toContain("┌─ Commerce");
    expect(output.stderr).toContain("STOPPED");
  });
});
