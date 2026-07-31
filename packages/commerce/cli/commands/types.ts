/* biome-ignore-all lint/suspicious/noConsole: CLI commands write user-facing output. */

import { fileURLToPath } from "node:url";
import chalk from "chalk";
import { Command } from "commander";
import ora from "ora";
import { generateCustomTypes, generateProductTypes } from "../typegen";

const CUSTOM_TYPE_SCHEMA_DIRECTORY = fileURLToPath(
  new URL("../../schema/types", import.meta.url)
);
const PRODUCT_TYPE_SCHEMA_DIRECTORY = fileURLToPath(
  new URL("../../schema/product-types", import.meta.url)
);
const CUSTOM_FIELD_OUTPUT_DIRECTORY = fileURLToPath(
  new URL("../../lib/custom-fields/generated", import.meta.url)
);
const PRODUCT_ATTRIBUTE_OUTPUT_DIRECTORY = fileURLToPath(
  new URL("../../lib/product/generated", import.meta.url)
);

export const createTypesCommand = (): Command => {
  const types = new Command("types").description(
    "Commercetools schema type-generation commands"
  );

  types
    .command("generate")
    .description("Generate TypeScript helpers from exported schema files")
    .action(async () => {
      const spinner = ora("Generating schema types").start();

      try {
        await Promise.all([
          generateCustomTypes(
            CUSTOM_TYPE_SCHEMA_DIRECTORY,
            CUSTOM_FIELD_OUTPUT_DIRECTORY
          ),
          generateProductTypes(
            PRODUCT_TYPE_SCHEMA_DIRECTORY,
            PRODUCT_ATTRIBUTE_OUTPUT_DIRECTORY
          ),
        ]);

        spinner.succeed("Schema types generated");
        console.log(
          chalk.green(
            "Generated custom-field and product-attribute TypeScript definitions"
          )
        );
      } catch (error) {
        spinner.fail("Type generation failed");
        console.error(error);
        process.exitCode = 1;
      }
    });

  return types;
};
