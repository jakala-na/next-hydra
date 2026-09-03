import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { generateCustomTypes, generateProductTypes } from "./typegen";

const temporaryDirectories: string[] = [];

const createTemporaryDirectory = async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "next-hydra-cli-"));
  temporaryDirectories.push(directory);
  return directory;
};

describe("schema type generation", () => {
  afterEach(async () => {
    await Promise.all(
      temporaryDirectories.splice(0).map(async (directory) => {
        await rm(directory, { force: true, recursive: true });
      })
    );
  });

  it("generates an executable Effect Custom Type definition", async () => {
    const schemaDirectory = await createTemporaryDirectory();
    const outputDirectory = await createTemporaryDirectory();

    await writeFile(
      path.join(schemaDirectory, "orderCustomFields.json"),
      JSON.stringify({
        fieldDefinitions: [
          {
            label: { "en-US": "Checkout contact" },
            name: "checkoutContact",
            required: false,
            type: { name: "String" },
          },
          {
            label: { "en-US": "State" },
            name: "state",
            required: true,
            type: {
              name: "Enum",
              values: [
                { key: "open", label: "Open" },
                { key: "closed", label: "Closed" },
              ],
            },
          },
          {
            label: { "en-US": "Related products" },
            name: "relatedProducts",
            required: false,
            type: {
              elementType: {
                name: "Reference",
                referenceTypeId: "product",
              },
              name: "Set",
            },
          },
        ],
        key: "orderCustomFields",
      }),
      "utf-8"
    );

    await generateCustomTypes(schemaDirectory, outputDirectory);

    const schemas = await readFile(
      path.join(outputDirectory, "schemas.ts"),
      "utf-8"
    );

    expect({
      definesCustomType: schemas.includes(
        "export const OrderCustomFields = CustomFields.define({"
      ),
      emitsEnum: schemas.includes(
        '"state": Schema.Literals(["open", "closed"])'
      ),
      emitsOptionalField: schemas.includes(
        '"checkoutContact": Schema.optionalKey(Schema.String)'
      ),
      emitsReferenceSet: schemas.includes(
        'Schema.ReadonlySet(CustomFields.reference("product"))'
      ),
      emitsType: schemas.includes(
        "export type OrderCustomFields = typeof OrderCustomFields.schema.Type;"
      ),
      preservesTypeKey: schemas.includes('typeKey: "orderCustomFields"'),
    }).toStrictEqual({
      definesCustomType: true,
      emitsEnum: true,
      emitsOptionalField: true,
      emitsReferenceSet: true,
      emitsType: true,
      preservesTypeKey: true,
    });
  });

  it("generates Product Type attribute definitions", async () => {
    const schemaDirectory = await createTemporaryDirectory();
    const outputDirectory = await createTemporaryDirectory();

    await writeFile(
      path.join(schemaDirectory, "equipment.json"),
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
          {
            isRequired: true,
            name: "mobility",
            type: {
              name: "enum",
              values: [
                { key: "tracked", label: "Tracked" },
                { key: "wheeled", label: "Wheeled" },
              ],
            },
          },
        ],
        key: "equipment",
      }),
      "utf-8"
    );

    await generateProductTypes(schemaDirectory, outputDirectory);

    const attributes = await readFile(
      path.join(outputDirectory, "attributes.ts"),
      "utf-8"
    );
    expect({
      definesAttributeMap: attributes.includes(
        "export const ProductAttributesSchemaByProductType = {"
      ),
      definesDetail: attributes.includes(
        "export const ProductDetail = ProductDetailSchema.check("
      ),
      emitsClosedEnum: attributes.includes(
        'makeProductAttributeEnumValueSchema(["tracked", "wheeled"])'
      ),
      emitsDate: attributes.includes("availableOn: ProductAttributeDate"),
      emitsNumber: attributes.includes("capacity: Schema.Number"),
      emitsOptionalSet: attributes.includes(
        "certifications: Schema.optional(Schema.Array(Schema.String))"
      ),
      emitsProductReference: attributes.includes(
        "relatedProducts: Schema.Array(ProductId)"
      ),
      hasLegacyGeneric: attributes.includes("ProductAttribute<"),
      importsSdk: attributes.includes("@commercetools"),
      preservesTypeKey: attributes.includes(
        'const EquipmentProductTypeKey = Schema.Literal("equipment").pipe('
      ),
    }).toStrictEqual({
      definesAttributeMap: true,
      definesDetail: true,
      emitsClosedEnum: true,
      emitsDate: true,
      emitsNumber: true,
      emitsOptionalSet: true,
      emitsProductReference: true,
      hasLegacyGeneric: false,
      importsSdk: false,
      preservesTypeKey: true,
    });
  });
});
