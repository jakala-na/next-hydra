import {
  createCommerceCliLayer,
  createCommerceCommand,
} from "@repo/commerce-provider/cli";
import { Effect, Option } from "effect";
import { CliConfig, Command, Flag, GlobalFlag } from "effect/unstable/cli";

import { loadCliConfigProvider } from "./config-provider";

export const workspaceCliConfig = CliConfig.make({
  builtIns: [GlobalFlag.Help, GlobalFlag.Version],
});

export const createProgram = (
  loadConfigProvider: typeof loadCliConfigProvider = loadCliConfigProvider
) => {
  const root = Command.make("cli", {}, () => Effect.void).pipe(
    Command.withDescription("Workspace administration CLI"),
    Command.withSharedFlags({
      envFile: Flag.string("env-file").pipe(
        Flag.withDescription(
          "Load environment variables from a file before validating package keys"
        ),
        Flag.optional
      ),
    })
  );

  const configProvider = Effect.gen(function* () {
    const { envFile } = yield* root;
    return yield* loadConfigProvider(Option.getOrUndefined(envFile));
  });
  const commerce = createCommerceCommand().pipe(
    Command.provide(createCommerceCliLayer(configProvider))
  );

  return root.pipe(Command.withSubcommands([commerce]));
};
