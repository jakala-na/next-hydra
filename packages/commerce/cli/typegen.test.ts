import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { generateCustomTypes, generateProductTypes } from "./typegen";

const temporaryDirectories: string[] = [];

const createTemporaryDirectory = async () => {
  const directory = await mkdtemp(join(tmpdir(), "next-hydra-cli-"));
  temporaryDirectories.push(directory);
  return directory;
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

describe("schema type generation", () => {
  it("generates a typed Custom Type and field resolver", async () => {
    const schemaDirectory = await createTemporaryDirectory();
    const outputDirectory = await createTemporaryDirectory();

    await writeFile(
      join(schemaDirectory, "orderCustomFields.json"),
      JSON.stringify({
        key: "orderCustomFields",
        fieldDefinitions: [
          {
            name: "checkoutContact",
            label: { "en-US": "Checkout contact" },
            type: { name: "String" },
          },
        ],
      }),
      "utf8"
    );

    await generateCustomTypes(schemaDirectory, outputDirectory);

    const types = await readFile(join(outputDirectory, "types.ts"), "utf8");
    const schemas = await readFile(join(outputDirectory, "schemas.ts"), "utf8");

    expect(types).toContain("export type OrderCustomFieldsSchema = {");
    expect(types).toContain('checkoutContact: CustomField<"text">;');
    expect(schemas).toContain("resolveOrderCustomField");
  });

  it("generates Product Type attribute definitions", async () => {
    const schemaDirectory = await createTemporaryDirectory();
    const outputDirectory = await createTemporaryDirectory();

    await writeFile(
      join(schemaDirectory, "equipment.json"),
      JSON.stringify({
        key: "equipment",
        attributes: [
          {
            name: "capacity",
            type: { name: "number" },
          },
          {
            name: "certifications",
            type: {
              name: "set",
              elementType: { name: "text" },
            },
          },
        ],
      }),
      "utf8"
    );

    await generateProductTypes(schemaDirectory, outputDirectory);

    const attributes = await readFile(
      join(outputDirectory, "attributes.ts"),
      "utf8"
    );
    expect(attributes).toContain('capacity: ProductAttribute<"number">;');
    expect(attributes).toContain('certifications: ProductAttribute<"text">[];');
  });
});
