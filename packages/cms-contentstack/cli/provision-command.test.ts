import { NodeServices } from "@effect/platform-node";
import { Effect, Exit, Stdio } from "effect";
import { TestConsole } from "effect/testing";
import { Command } from "effect/unstable/cli";
import { describe, expect, it, vi } from "vitest";

import { createCmsCommand } from "./index";
import {
  ContentstackApiKey,
  ContentstackCliVersionError,
  ContentstackProvisioningReceipt,
} from "./provisioning/model";
import { provisionContentstack } from "./provisioning/provision";

vi.mock("./layer", async () => {
  const { Layer } = await import("effect");
  return { createContentstackProvisioningLayer: () => Layer.empty };
});
vi.mock("./provisioning/provision", () => ({ provisionContentstack: vi.fn() }));

async function run() {
  return Effect.gen(function* () {
    const exit = yield* Command.runWith(
      createCmsCommand(Effect.die("No configuration reads expected")),
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

describe("Contentstack provision command output", () => {
  it("prints one framed result using explicit command inputs and the provisioning receipt", async () => {
    vi.mocked(provisionContentstack).mockReturnValue(
      Effect.succeed(
        new ContentstackProvisioningReceipt({
          apiKey: ContentstackApiKey.make("stack-id"),
          credentials: {
            destination: "local",
            mode: 0o600,
            path: "/private/cms.env",
          },
          environments: ["development"],
          imported: true,
          livePreviewConfigurationRequired: true,
          migrationsApplied: 2,
          recipeVersion: "4",
          region: "EU",
        })
      )
    );
    const output = await run();
    expect(Exit.isSuccess(output.exit)).toBe(true);
    expect(output.stdout.match(/┌─ CMS · Contentstack/gu)).toHaveLength(1);
    expect(output.stdout).toContain("https://shop.example.test");
    expect(output.stdout).toContain("Migrations applied: 2");
    expect(output.stdout).not.toContain("\u001b[");
    expect(vi.mocked(provisionContentstack).mock.lastCall?.[0]).toMatchObject({
      managementTokenAlias: "stack-alias",
      productionUrl: "https://shop.example.test",
    });
  });

  it("does not print a success receipt when provisioning stops", async () => {
    vi.mocked(provisionContentstack).mockReturnValue(
      Effect.fail(
        new ContentstackCliVersionError({
          message: "Unsupported CLI",
          actual: "old",
          expected: "required",
          cause: new Error("Unsupported CLI"),
        })
      )
    );
    const output = await run();
    expect(Exit.isFailure(output.exit)).toBe(true);
    expect(output.stdout).not.toContain("┌─ CMS");
    expect(output.stderr).toContain("STOPPED");
  });
});
