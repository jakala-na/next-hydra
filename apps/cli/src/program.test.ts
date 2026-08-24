import { NodeServices } from "@effect/platform-node";
import { Console, Effect, Exit } from "effect";
import { CliConfig, Command } from "effect/unstable/cli";
import { describe, expect, it, vi } from "vitest";

import type { loadCliConfigProvider } from "./config-provider";
import { createProgram, workspaceCliConfig } from "./program";

const makeConfigProviderLoader = () =>
  vi.fn<typeof loadCliConfigProvider>(() =>
    Effect.die("config provider should be resolved by commands that need it")
  );

const runProgram = async (
  program: ReturnType<typeof createProgram>,
  arguments_: readonly string[]
) => {
  const stderr: string[] = [];
  const stdout: string[] = [];
  const testConsole: Console.Console = {
    ...console,
    error: (...values: readonly unknown[]) => {
      stderr.push(values.join(" "));
    },
    log: (...values: readonly unknown[]) => {
      stdout.push(values.join(" "));
    },
  };

  const exit = await Command.runWith(program, { version: "0.0.0" })(
    arguments_
  ).pipe(
    Effect.provideService(CliConfig.CliConfig, workspaceCliConfig),
    Effect.provideService(Console.Console, testConsole),
    Effect.provide(NodeServices.layer),
    Effect.exit,
    Effect.runPromise
  );

  return {
    exit,
    stderr: stderr.join("\n"),
    stdout: stdout.join("\n"),
  };
};

describe("workspace CLI program", () => {
  it("lists provider commands without eagerly validating their environment", async () => {
    const loadConfigProvider = makeConfigProviderLoader();

    const result = await runProgram(createProgram(loadConfigProvider), [
      "--help",
    ]);

    expect(Exit.isSuccess(result.exit)).toBeTruthy();
    expect(
      [
        "cms",
        "commerce",
        "auth        Customer authentication administration commands",
        "Commercetools administration commands",
      ].every((value) => result.stdout.includes(value))
    ).toBeTruthy();
    expect(loadConfigProvider).not.toHaveBeenCalled();
  });

  it("lists auth provisioning without loading customer credentials", async () => {
    const loadConfigProvider = makeConfigProviderLoader();

    const result = await runProgram(createProgram(loadConfigProvider), [
      "auth",
      "--help",
    ]);

    expect(Exit.isSuccess(result.exit)).toBeTruthy();
    expect(result.stdout).toContain("provision");
    expect(result.stdout).toContain("customer identity provider webhook");
    expect(loadConfigProvider).not.toHaveBeenCalled();
  });

  it("documents auth provision inputs without loading customer credentials", async () => {
    const loadConfigProvider = makeConfigProviderLoader();

    const result = await runProgram(createProgram(loadConfigProvider), [
      "auth",
      "provision",
      "--help",
    ]);

    expect(Exit.isSuccess(result.exit)).toBeTruthy();
    expect(result.stdout).toContain("--api-url");
    expect(result.stdout).toContain("--output");
    expect(loadConfigProvider).not.toHaveBeenCalled();
  });

  it("lists the selected CMS provisioning command without loading credentials", async () => {
    const loadConfigProvider = makeConfigProviderLoader();

    const result = await runProgram(createProgram(loadConfigProvider), [
      "cms",
      "--help",
    ]);

    expect(Exit.isSuccess(result.exit)).toBeTruthy();
    expect(result.stdout).toContain("provision");
    expect(loadConfigProvider).not.toHaveBeenCalled();
  });

  it("resolves deep help and the shared env-file flag without running a command", async () => {
    const loadConfigProvider = makeConfigProviderLoader();

    const result = await runProgram(createProgram(loadConfigProvider), [
      "commerce",
      "types",
      "--env-file",
      "stage.env",
      "--help",
    ]);

    expect(Exit.isSuccess(result.exit)).toBeTruthy();
    expect(result.stdout).toContain("generate");
    expect(result.stdout).toContain(
      "Generate TypeScript helpers from exported schema files"
    );
    expect(loadConfigProvider).not.toHaveBeenCalled();
  });

  it("exposes project provision and seed without loading credentials for help", async () => {
    const loadConfigProvider = makeConfigProviderLoader();

    const result = await runProgram(createProgram(loadConfigProvider), [
      "commerce",
      "project",
      "--help",
    ]);

    expect(Exit.isSuccess(result.exit)).toBeTruthy();
    expect(result.stdout).toContain("provision");
    expect(result.stdout).toContain("seed");
    expect(result.stdout).toContain("Commercetools project setup commands");
    expect(loadConfigProvider).not.toHaveBeenCalled();
  });

  it("documents the explicit credential output without resolving config", async () => {
    const loadConfigProvider = makeConfigProviderLoader();

    const result = await runProgram(createProgram(loadConfigProvider), [
      "commerce",
      "project",
      "provision",
      "--help",
    ]);

    expect(Exit.isSuccess(result.exit)).toBeTruthy();
    expect(result.stdout).toContain("--output");
    expect(result.stdout).toContain("runtime credentials");
    expect(loadConfigProvider).not.toHaveBeenCalled();
  });

  it("keeps the CLI UIless by excluding the wizard built-in", async () => {
    const loadConfigProvider = makeConfigProviderLoader();

    const result = await runProgram(createProgram(loadConfigProvider), [
      "--wizard",
    ]);

    expect(Exit.isFailure(result.exit)).toBeTruthy();
    expect(result.stderr).toContain("Unrecognized flag: --wizard");
    expect(loadConfigProvider).not.toHaveBeenCalled();
  });

  it("retains version support and no-op parent command execution", async () => {
    const loadConfigProvider = makeConfigProviderLoader();
    const program = createProgram(loadConfigProvider);

    const version = await runProgram(program, ["--version"]);
    const parent = await runProgram(program, []);

    expect(Exit.isSuccess(version.exit)).toBeTruthy();
    expect(version.stdout).toContain("0.0.0");
    expect(Exit.isSuccess(parent.exit)).toBeTruthy();
    expect(parent.stdout).toBe("");
    expect(loadConfigProvider).not.toHaveBeenCalled();
  });

  it("loads provider configuration lazily with the parsed env-file path", async () => {
    const loadConfigProvider = makeConfigProviderLoader();

    const result = await runProgram(createProgram(loadConfigProvider), [
      "commerce",
      "migrate",
      "plan",
      "--env-file",
      "stage.env",
    ]);

    expect(Exit.isFailure(result.exit)).toBeTruthy();
    expect(loadConfigProvider).toHaveBeenCalledExactlyOnceWith("stage.env");
  });
});
