import { Command } from "commander";

import { createMigrateCommand } from "./commands/migrate";
import { createSchemaCommand } from "./commands/schema";
import { createTypesCommand } from "./commands/types";
import type { CommerceCliEnvironmentProvider } from "./environment";

export const createCommerceCommand = (
  environment: CommerceCliEnvironmentProvider
): Command => {
  const commerce = new Command("commerce").description(
    "Commercetools administration commands"
  );

  commerce.addCommand(createMigrateCommand(environment));
  commerce.addCommand(createSchemaCommand(environment));
  commerce.addCommand(createTypesCommand());

  return commerce;
};
