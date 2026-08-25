import { createCommerceCommand } from "@repo/commerce-provider/cli";
import { Command } from "commander";

import type { env } from "../env";

export const createProgram = (
  environment: () => ReturnType<typeof env>
): Command => {
  const program = new Command()
    .name("cli")
    .description("Workspace administration CLI")
    .version("0.0.0")
    .option(
      "--env-file <path>",
      "Load environment variables from a file before validating package keys"
    )
    .showHelpAfterError();

  program.addCommand(createCommerceCommand(environment));

  return program;
};
