import { Effect } from "effect";
import { Command } from "effect/unstable/cli";

import { createMigrateCommand } from "./commands/migrate";
import { createSchemaCommand } from "./commands/schema";
import { createTypesCommand } from "./commands/types";

export { createCommerceCliLayer } from "./layer";

export const createCommerceCommand = () =>
  Command.make("commerce", {}, () => Effect.void).pipe(
    Command.withDescription("Commercetools administration commands"),
    Command.withSubcommands([
      createMigrateCommand(),
      createSchemaCommand(),
      createTypesCommand(),
    ])
  );
