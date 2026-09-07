import { runMain } from "@effect/platform-node/NodeRuntime";
import { layer as nodeServicesLayer } from "@effect/platform-node/NodeServices";
import { Effect } from "effect";
import { CliConfig, Command } from "effect/unstable/cli";

import { createProgram, workspaceCliConfig } from "./program";

const main = Command.run(createProgram(), { version: "0.0.0" }).pipe(
  Effect.provideService(CliConfig.CliConfig, workspaceCliConfig),
  Effect.provide(nodeServicesLayer)
);

runMain(main);
