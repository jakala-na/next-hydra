/* oxlint-disable no-await-in-loop -- Pagination and schema writes preserve source order. */

import { mkdir, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type {
  ByProjectKeyRequestBuilder,
  ProductType,
  Type,
} from "@commercetools/platform-sdk";
import chalk from "chalk";
import { Console, Effect, Option } from "effect";
import { CliError, Command, Flag } from "effect/unstable/cli";
import ora from "ora";

import { CommercetoolsRestClient } from "../../client/rest-client";

const DEFAULT_SCHEMA_DIRECTORY = fileURLToPath(
  new URL("../../schema", import.meta.url)
);
const PAGE_SIZE = 500;
type ExportedProductTypeDocument = {
  readonly attributes: ProductType["attributes"];
  readonly description: ProductType["description"];
  readonly key: string;
  readonly name: ProductType["name"];
};
type ExportedCustomTypeDocument = {
  readonly description: Type["description"];
  readonly fieldDefinitions: Type["fieldDefinitions"];
  readonly key: Type["key"];
  readonly name: Type["name"];
  readonly resourceTypeIds: Type["resourceTypeIds"];
};
type ExportedSchemaDocument =
  | ExportedProductTypeDocument
  | ExportedCustomTypeDocument;

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

const writeJson = async (
  filePath: string,
  value: ExportedSchemaDocument
): Promise<void> => {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
};

export const prepareSchemaDirectory = async (
  directory: string
): Promise<void> => {
  await mkdir(directory, { recursive: true });
  const files = await readdir(directory);

  await Promise.all(
    files
      .filter((file) => file.endsWith(".json"))
      .map(async (file) => {
        await unlink(path.resolve(directory, file));
      })
  );
};

const exportProductTypes = async (
  outputDirectory: string,
  productTypes: readonly ProductType[]
) => {
  const directory = path.resolve(outputDirectory, "product-types");
  await prepareSchemaDirectory(directory);

  for (const productType of productTypes) {
    if (!productType.key) {
      continue;
    }

    await writeJson(path.resolve(directory, `${productType.key}.json`), {
      attributes: productType.attributes ?? [],
      description: productType.description,
      key: productType.key,
      name: productType.name,
    });
  }
};

const exportCustomTypes = async (
  outputDirectory: string,
  customTypes: readonly Type[]
) => {
  const directory = path.resolve(outputDirectory, "types");
  await prepareSchemaDirectory(directory);

  for (const customType of customTypes) {
    await writeJson(path.resolve(directory, `${customType.key}.json`), {
      description: customType.description,
      fieldDefinitions: customType.fieldDefinitions,
      key: customType.key,
      name: customType.name,
      resourceTypeIds: customType.resourceTypeIds,
    });
  }
};

// oxlint-disable-next-line max-lines-per-function -- Keeps the small command tree beside its handler.
export const createSchemaCommand = () => {
  const exportSchema = Command.make(
    "export",
    {
      output: Flag.string("output").pipe(
        Flag.withDescription(
          "Output directory (defaults to packages/commerce-commercetools/schema)"
        ),
        Flag.optional
      ),
    },
    ({ output }) =>
      Effect.gen(function* () {
        const { apiRoot } = yield* CommercetoolsRestClient;
        const spinner = ora("Exporting Commercetools schema").start();
        const outputDirectory = Option.match(output, {
          onNone: () => DEFAULT_SCHEMA_DIRECTORY,
          onSome: (outputPath) => path.resolve(process.cwd(), outputPath),
        });

        yield* Effect.tryPromise({
          catch: (cause) => {
            spinner.fail("Schema export failed");
            return new CliError.UserError({ cause });
          },
          try: async () => {
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
          },
        });
        yield* Console.log(chalk.green(`Schema written to ${outputDirectory}`));
      })
  ).pipe(Command.withDescription("Export Product Types and Custom Types"));

  return Command.make("schema", {}, () => Effect.void).pipe(
    Command.withDescription("Commercetools schema commands"),
    Command.withSubcommands([exportSchema])
  );
};
