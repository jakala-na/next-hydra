import type { ConfigProvider, Effect as EffectType } from "effect";
import { Effect } from "effect";
import { Command } from "effect/unstable/cli";

import { createMigrateCommand } from "./commands/migrate";
import { createProjectCommand } from "./commands/project";
import { createSchemaCommand } from "./commands/schema";
import { createTypesCommand } from "./commands/types";
import { createCommerceCliLayer } from "./layer";

export { createCommerceCliLayer } from "./layer";

export const createCommerceCommand = <E, R>(
  configProvider: EffectType.Effect<ConfigProvider.ConfigProvider, E, R>
) => {
  const runtimeLayer = createCommerceCliLayer(configProvider);

  return Command.make("commerce", {}, () => Effect.void).pipe(
    Command.withDescription("Commercetools administration commands"),
    Command.withSubcommands([
      createMigrateCommand().pipe(Command.provide(runtimeLayer)),
      createProjectCommand(configProvider),
      createSchemaCommand().pipe(Command.provide(runtimeLayer)),
      createTypesCommand(),
    ])
  );
};
