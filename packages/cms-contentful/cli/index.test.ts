import { NodeServices } from "@effect/platform-node";
import { Console, Effect, Exit } from "effect";
import { CliConfig, Command, GlobalFlag } from "effect/unstable/cli";
import { describe, expect, it } from "vitest";

import { createCmsCommand } from "./index";

const cmsCliConfig = CliConfig.make({
  builtIns: [GlobalFlag.Help, GlobalFlag.Version],
});

describe(createCmsCommand, () => {
  it("documents Contentful migrations without resolving credentials", async () => {
    const stdout: string[] = [];
    const testConsole: Console.Console = {
      ...console,
      log: (...values: readonly unknown[]) => {
        stdout.push(values.join(" "));
      },
    };
    const configProvider = Effect.die(
      "config provider should not be resolved for help"
    );

    const exit = await Command.runWith(createCmsCommand(configProvider), {
      version: "0.0.0",
    })(["migrate", "--help"]).pipe(
      Effect.provideService(CliConfig.CliConfig, cmsCliConfig),
      Effect.provideService(Console.Console, testConsole),
      Effect.provide(NodeServices.layer),
      Effect.exit,
      Effect.runPromise
    );

    const help = stdout.join("\n");

    expect(Exit.isSuccess(exit)).toBeTruthy();
    expect(help).toContain("--space-id");
    expect(help).toContain("--environment");
    expect(help).toContain("--management-token");
    expect(help).toContain("empty environment");
  });
});
