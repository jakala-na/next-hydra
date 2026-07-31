/* biome-ignore-all lint/suspicious/noConsole: CLI commands write user-facing output. */

import { mkdir, readdir, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  ByProjectKeyRequestBuilder,
  ProductType,
  Type,
} from "@commercetools/platform-sdk";
import chalk from "chalk";
import { Command } from "commander";
import ora from "ora";
import { createCommercetoolsClient } from "../client";
import type { CommerceCliEnvironmentProvider } from "../environment";

const DEFAULT_SCHEMA_DIRECTORY = fileURLToPath(
  new URL("../../schema", import.meta.url)
);
const PAGE_SIZE = 500;

const fetchProductTypes = async (
  apiRoot: ByProjectKeyRequestBuilder
): Promise<ProductType[]> => {
  const productTypes: ProductType[] = [];
  let offset = 0;

  while (true) {
    const response = await apiRoot
      .productTypes()
      .get({
        queryArgs: {
          limit: PAGE_SIZE,
          offset,
          sort: "key asc",
        },
      })
      .execute();

    productTypes.push(...response.body.results);
    if (response.body.results.length < PAGE_SIZE) {
      return productTypes;
    }
    offset += PAGE_SIZE;
  }
};

const fetchCustomTypes = async (
  apiRoot: ByProjectKeyRequestBuilder
): Promise<Type[]> => {
  const customTypes: Type[] = [];
  let offset = 0;

  while (true) {
    const response = await apiRoot
      .types()
      .get({
        queryArgs: {
          limit: PAGE_SIZE,
          offset,
          sort: "key asc",
        },
      })
      .execute();

    customTypes.push(...response.body.results);
    if (response.body.results.length < PAGE_SIZE) {
      return customTypes;
    }
    offset += PAGE_SIZE;
  }
};

const writeJson = async (path: string, value: unknown): Promise<void> => {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

export const prepareSchemaDirectory = async (
  directory: string
): Promise<void> => {
  await mkdir(directory, { recursive: true });
  const files = await readdir(directory);

  await Promise.all(
    files
      .filter((file) => file.endsWith(".json"))
      .map((file) => unlink(resolve(directory, file)))
  );
};

const exportProductTypes = async (
  outputDirectory: string,
  productTypes: readonly ProductType[]
) => {
  const directory = resolve(outputDirectory, "product-types");
  await prepareSchemaDirectory(directory);

  for (const productType of productTypes) {
    if (!productType.key) {
      continue;
    }

    await writeJson(resolve(directory, `${productType.key}.json`), {
      key: productType.key,
      name: productType.name,
      description: productType.description,
      attributes: productType.attributes ?? [],
    });
  }
};

const exportCustomTypes = async (
  outputDirectory: string,
  customTypes: readonly Type[]
) => {
  const directory = resolve(outputDirectory, "types");
  await prepareSchemaDirectory(directory);

  for (const customType of customTypes) {
    await writeJson(resolve(directory, `${customType.key}.json`), {
      key: customType.key,
      name: customType.name,
      ...(customType.description === undefined
        ? {}
        : { description: customType.description }),
      resourceTypeIds: customType.resourceTypeIds,
      fieldDefinitions: customType.fieldDefinitions,
    });
  }
};

export const createSchemaCommand = (
  environment: CommerceCliEnvironmentProvider
): Command => {
  const schema = new Command("schema").description(
    "Commercetools schema commands"
  );

  schema
    .command("export")
    .description("Export Product Types and Custom Types")
    .option(
      "--output <path>",
      "Output directory (defaults to packages/commerce/schema)"
    )
    .action(async (options: { readonly output?: string }) => {
      const spinner = ora("Exporting Commercetools schema").start();

      try {
        const apiRoot = createCommercetoolsClient(environment());
        const outputDirectory =
          options.output === undefined
            ? DEFAULT_SCHEMA_DIRECTORY
            : resolve(process.cwd(), options.output);

        spinner.text = "Fetching Product Types";
        const productTypes = await fetchProductTypes(apiRoot);

        spinner.text = "Fetching Custom Types";
        const customTypes = await fetchCustomTypes(apiRoot);

        spinner.text = "Writing schema files";
        await Promise.all([
          exportProductTypes(outputDirectory, productTypes),
          exportCustomTypes(outputDirectory, customTypes),
        ]);

        spinner.succeed(
          `Exported ${productTypes.length} Product Type(s) and ${customTypes.length} Custom Type(s)`
        );
        console.log(chalk.green(`Schema written to ${outputDirectory}`));
      } catch (error) {
        spinner.fail("Schema export failed");
        console.error(error);
        process.exitCode = 1;
      }
    });

  return schema;
};
