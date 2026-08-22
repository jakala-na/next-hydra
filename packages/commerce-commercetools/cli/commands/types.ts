import { fileURLToPath } from "node:url";

import chalk from "chalk";
import { Console, Effect } from "effect";
import { CliError, Command } from "effect/unstable/cli";
import ora from "ora";

import { generateCustomTypes, generateProductTypes } from "../typegen";

const CUSTOM_TYPE_SCHEMA_DIRECTORY = fileURLToPath(
  new URL("../../schema/types", import.meta.url)
);
const PRODUCT_TYPE_SCHEMA_DIRECTORY = fileURLToPath(
  new URL("../../schema/product-types", import.meta.url)
);
const CUSTOM_FIELD_OUTPUT_DIRECTORY = fileURLToPath(
  new URL("../../custom-fields/generated", import.meta.url)
);
const CORE_PRODUCT_ATTRIBUTE_OUTPUT_DIRECTORY = fileURLToPath(
  new URL("../../../commerce/product/generated", import.meta.url)
);

export const createTypesCommand = () => {
  const generate = Command.make("generate", {}, () => {
    const spinner = ora("Generating schema types").start();

    return Effect.tryPromise({
      catch: (cause) => {
        spinner.fail("Type generation failed");
        return new CliError.UserError({ cause });
      },
      try: async () => {
        await Promise.all([
          generateCustomTypes(
            CUSTOM_TYPE_SCHEMA_DIRECTORY,
            CUSTOM_FIELD_OUTPUT_DIRECTORY
          ),
          generateProductTypes(
            PRODUCT_TYPE_SCHEMA_DIRECTORY,
            CORE_PRODUCT_ATTRIBUTE_OUTPUT_DIRECTORY
          ),
        ]);

        spinner.succeed("Schema types generated");
      },
    }).pipe(
      Effect.andThen(
        Console.log(
          chalk.green(
            "Generated custom-field and product-attribute TypeScript definitions"
          )
        )
      )
    );
  }).pipe(
    Command.withDescription(
      "Generate TypeScript helpers from exported schema files"
    )
  );

  return Command.make("types", {}, () => Effect.void).pipe(
    Command.withDescription("Commercetools schema type-generation commands"),
    Command.withSubcommands([generate])
  );
};
