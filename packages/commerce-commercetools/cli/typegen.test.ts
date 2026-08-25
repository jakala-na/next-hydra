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
    temporaryDirectories.splice(0).map(async (directory) => {
      await rm(directory, { force: true, recursive: true });
    })
  );
});

describe("schema type generation", () => {
  it("generates a typed Custom Type and field resolver", async () => {
    const schemaDirectory = await createTemporaryDirectory();
    const outputDirectory = await createTemporaryDirectory();

    await writeFile(
      join(schemaDirectory, "orderCustomFields.json"),
      JSON.stringify({
        fieldDefinitions: [
          {
            label: { "en-US": "Checkout contact" },
            name: "checkoutContact",
            type: { name: "String" },
          },
        ],
        key: "orderCustomFields",
      }),
      "utf-8"
    );

    await generateCustomTypes(schemaDirectory, outputDirectory);

    const types = await readFile(join(outputDirectory, "types.ts"), "utf-8");
    const schemas = await readFile(
      join(outputDirectory, "schemas.ts"),
      "utf-8"
    );

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
        attributes: [
          {
            isRequired: true,
            name: "capacity",
            type: { name: "number" },
          },
          {
            isRequired: false,
            name: "certifications",
            type: {
              elementType: { name: "text" },
              name: "set",
            },
          },
          {
            isRequired: true,
            name: "relatedProducts",
            type: {
              elementType: {
                name: "reference",
                referenceTypeId: "product",
              },
              name: "set",
            },
          },
          {
            isRequired: true,
            name: "availableOn",
            type: { name: "date" },
          },
        ],
        key: "equipment",
      }),
      "utf-8"
    );

    await generateProductTypes(schemaDirectory, outputDirectory);

    const attributes = await readFile(
      join(outputDirectory, "attributes.ts"),
      "utf-8"
    );
    expect(attributes).toContain(
      'const EquipmentProductTypeKey = Schema.Literal("equipment").pipe('
    );
    expect(attributes).toContain("capacity: Schema.Number");
    expect(attributes).toContain(
      "certifications: Schema.optional(Schema.Array(Schema.String))"
    );
    expect(attributes).toContain("relatedProducts: Schema.Array(ProductId)");
    expect(attributes).toContain("availableOn: ProductAttributeDate");
    expect(attributes).toContain(
      "export const ProductAttributesSchemaByProductType = {"
    );
    expect(attributes).toContain(
      "export const ProductDetail = ProductDetailSchema.check("
    );
    expect(attributes).not.toContain("@commercetools");
    expect(attributes).not.toContain("ProductAttribute<");
  });
});
