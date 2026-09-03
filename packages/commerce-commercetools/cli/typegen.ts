import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { Schema } from "effect";

type CustomTypeFieldDefinition = {
  readonly name: string;
  readonly label: Record<string, string>;
  readonly required?: boolean;
  readonly type: {
    readonly name:
      | "String"
      | "LocalizedString"
      | "Number"
      | "Boolean"
      | "Date"
      | "Time"
      | "DateTime"
      | "Money"
      | "Enum"
      | "LocalizedEnum"
      | "Set"
      | "Reference";
    readonly referenceTypeId?: string;
    readonly values?: readonly {
      readonly key: string;
      readonly label: string | Record<string, string>;
    }[];
    readonly elementType?: CustomTypeFieldDefinition["type"];
  };
};

type CustomTypeSchema = {
  readonly key: string;
  readonly fieldDefinitions?: readonly CustomTypeFieldDefinition[];
};

type ProductTypeAttributeType = {
  readonly elementType?: ProductTypeAttributeType;
  readonly name: string;
  readonly referenceTypeId?: string;
  readonly values?: readonly {
    readonly key: string;
    readonly label: string | Record<string, string>;
  }[];
};

type ProductTypeAttribute = {
  readonly isRequired?: boolean;
  readonly name: string;
  readonly type: ProductTypeAttributeType;
};

type ProductTypeSchema = {
  readonly key: string;
  readonly attributes?: readonly ProductTypeAttribute[];
};

const CustomTypeFieldType: Schema.Codec<CustomTypeFieldDefinition["type"]> =
  Schema.Struct({
    elementType: Schema.optionalKey(Schema.suspend(() => CustomTypeFieldType)),
    name: Schema.Literals([
      "String",
      "LocalizedString",
      "Number",
      "Boolean",
      "Date",
      "Time",
      "DateTime",
      "Money",
      "Enum",
      "LocalizedEnum",
      "Set",
      "Reference",
    ]),
    referenceTypeId: Schema.optionalKey(Schema.String),
    values: Schema.optionalKey(
      Schema.Array(
        Schema.Struct({
          key: Schema.String,
          label: Schema.Union([
            Schema.String,
            Schema.Record(Schema.String, Schema.String),
          ]),
        })
      )
    ),
  });

const CustomTypeSchema: Schema.Codec<CustomTypeSchema> = Schema.Struct({
  fieldDefinitions: Schema.optionalKey(
    Schema.Array(
      Schema.Struct({
        label: Schema.Record(Schema.String, Schema.String),
        name: Schema.String,
        required: Schema.optionalKey(Schema.Boolean),
        type: CustomTypeFieldType,
      })
    )
  ),
  key: Schema.String,
});

const ProductTypeAttributeType: Schema.Codec<ProductTypeAttributeType> =
  Schema.Struct({
    elementType: Schema.optionalKey(
      Schema.suspend(() => ProductTypeAttributeType)
    ),
    name: Schema.String,
    referenceTypeId: Schema.optionalKey(Schema.String),
    values: Schema.optionalKey(
      Schema.Array(
        Schema.Struct({
          key: Schema.String,
          label: Schema.Union([
            Schema.String,
            Schema.Record(Schema.String, Schema.String),
          ]),
        })
      )
    ),
  });

const ProductTypeSchema: Schema.Codec<ProductTypeSchema> = Schema.Struct({
  attributes: Schema.optionalKey(
    Schema.Array(
      Schema.Struct({
        isRequired: Schema.optionalKey(Schema.Boolean),
        name: Schema.String,
        type: ProductTypeAttributeType,
      })
    )
  ),
  key: Schema.String,
});

const CASE_SEPARATOR = /[-_]/u;
const FILE_EXTENSION = ".json";

const toPascalCase = (value: string): string =>
  value
    .split(CASE_SEPARATOR)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");

const escapeLiteral = (value: string): string =>
  value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');

const readSchemas = async <TSchema>(
  directory: string,
  schema: Schema.Codec<TSchema>
): Promise<TSchema[]> => {
  let files: string[];
  try {
    files = await readdir(directory);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const decode = Schema.decodeUnknownSync(Schema.fromJsonString(schema));
  const schemaFiles = files.filter((candidate) =>
    candidate.endsWith(FILE_EXTENSION)
  );
  // oxlint-disable-next-line unicorn/no-array-sort -- This locally owned array is sorted for deterministic generated output.
  schemaFiles.sort();
  return await Promise.all(
    schemaFiles.map(async (file) =>
      decode(await readFile(path.join(directory, file), "utf-8"))
    )
  );
};

const customFieldSchema = (
  fieldType: CustomTypeFieldDefinition["type"]
): string => {
  switch (fieldType.name) {
    case "String": {
      return "Schema.String";
    }
    case "LocalizedString": {
      return "Schema.Record(Schema.String, Schema.String)";
    }
    case "Number": {
      return "Schema.Finite";
    }
    case "Boolean": {
      return "Schema.Boolean";
    }
    case "Date": {
      return "CustomFields.Date";
    }
    case "Time": {
      return "CustomFields.Time";
    }
    case "DateTime": {
      return "Schema.DateTimeUtc";
    }
    case "Money": {
      return "CustomFields.Money";
    }
    case "Enum":
    case "LocalizedEnum": {
      const values = fieldType.values ?? [];
      if (values.length === 0) {
        throw new Error(`${fieldType.name} Custom Field has no values`);
      }
      return `Schema.Literals([${values
        .map((value) => `"${escapeLiteral(value.key)}"`)
        .join(", ")}])`;
    }
    case "Reference": {
      if (fieldType.referenceTypeId === undefined) {
        throw new Error("Reference Custom Field has no referenceTypeId");
      }
      return `CustomFields.reference("${escapeLiteral(fieldType.referenceTypeId)}")`;
    }
    case "Set": {
      if (fieldType.elementType === undefined) {
        throw new Error("Set Custom Field has no elementType");
      }
      return `Schema.ReadonlySet(${customFieldSchema(fieldType.elementType)})`;
    }
    default: {
      throw new Error("Unsupported Custom Field type");
    }
  }
};

const generateCustomType = (schema: CustomTypeSchema): string => {
  const typeName = toPascalCase(schema.key);
  const fields = (schema.fieldDefinitions ?? []).map((field) => {
    const fieldSchema = customFieldSchema(field.type);
    return `    ${JSON.stringify(field.name)}: ${
      field.required === true
        ? fieldSchema
        : `Schema.optionalKey(${fieldSchema})`
    },`;
  });

  return `export const ${typeName} = CustomFields.define({
  typeKey: "${escapeLiteral(schema.key)}",
  fields: {
${fields.join("\n")}
  },
});
export type ${typeName} = typeof ${typeName}.schema.Type;`;
};

export const generateCustomTypes = async (
  schemaDirectory: string,
  outputDirectory: string
): Promise<void> => {
  const schemas = await readSchemas(schemaDirectory, CustomTypeSchema);
  await mkdir(outputDirectory, { recursive: true });

  const removeLegacyGeneratedFile = async (file: string): Promise<void> => {
    await rm(path.join(outputDirectory, file), { force: true });
  };
  await Promise.all(
    ["types.ts", "enum-values.ts", "field-kinds.ts"].map(
      removeLegacyGeneratedFile
    )
  );
  await writeFile(
    path.join(outputDirectory, "schemas.ts"),
    `// This file is auto-generated. Do not edit manually.
// Run \`pnpm cli commerce types generate\` to regenerate.

import { Schema } from "effect";

import * as CustomFields from "../definition";

${schemas.map(generateCustomType).join("\n\n")}
`,
    "utf-8"
  );
};

type ProductAttributeDependency =
  | "Money"
  | "ProductAttributeDate"
  | "ProductAttributeDateTime"
  | "makeProductAttributeEnumValueSchema"
  | "ProductAttributeTime"
  | "ProductId";

const TYPESCRIPT_IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/u;

const propertyName = (name: string): string =>
  TYPESCRIPT_IDENTIFIER.test(name) ? name : JSON.stringify(name);

const productTypeKeyName = (schemaKey: string): string => {
  const typeName = toPascalCase(schemaKey);
  return `${typeName}${typeName.endsWith("Product") ? "TypeKey" : "ProductTypeKey"}`;
};

const productVariantName = (schemaKey: string): string =>
  `${toPascalCase(schemaKey)}Variant`;

const productAttributeSchema = (
  attributeType: ProductTypeAttributeType,
  dependencies: Set<ProductAttributeDependency>
): string => {
  switch (attributeType.name) {
    case "text":
    case "ltext": {
      return "Schema.String";
    }
    case "number": {
      return "Schema.Number";
    }
    case "boolean": {
      return "Schema.Boolean";
    }
    case "enum":
    case "lenum": {
      const values = attributeType.values ?? [];
      if (values.length === 0) {
        throw new Error(
          `${attributeType.name} Product Attribute has no values`
        );
      }
      dependencies.add("makeProductAttributeEnumValueSchema");
      return `makeProductAttributeEnumValueSchema([${values
        .map((value) => JSON.stringify(value.key))
        .join(", ")}])`;
    }
    case "money": {
      dependencies.add("Money");
      return "Money";
    }
    case "date": {
      dependencies.add("ProductAttributeDate");
      return "ProductAttributeDate";
    }
    case "time": {
      dependencies.add("ProductAttributeTime");
      return "ProductAttributeTime";
    }
    case "datetime": {
      dependencies.add("ProductAttributeDateTime");
      return "ProductAttributeDateTime";
    }
    case "reference": {
      if (attributeType.referenceTypeId !== "product") {
        throw new Error(
          `Unsupported Product Attribute reference type: ${attributeType.referenceTypeId ?? "unknown"}`
        );
      }
      dependencies.add("ProductId");
      return "ProductId";
    }
    case "set": {
      if (attributeType.elementType === undefined) {
        throw new Error("Product Attribute set has no element type");
      }
      return `Schema.Array(${productAttributeSchema(
        attributeType.elementType,
        dependencies
      )})`;
    }
    default: {
      throw new Error(
        `Unsupported Product Attribute type: ${attributeType.name}`
      );
    }
  }
};

const generateProductAttributesSchema = (
  schema: ProductTypeSchema,
  dependencies: Set<ProductAttributeDependency>
): string => {
  const typeName = toPascalCase(schema.key);
  const attributes = schema.attributes ?? [];
  const declaration =
    attributes.length === 0
      ? "Schema.Record(\n  Schema.String,\n  Schema.Never\n)"
      : [
          "Schema.Struct({",
          ...attributes.map((attribute) => {
            const attributeSchema = productAttributeSchema(
              attribute.type,
              dependencies
            );
            return `  ${propertyName(attribute.name)}: ${
              attribute.isRequired === true
                ? attributeSchema
                : `Schema.optional(${attributeSchema})`
            },`;
          }),
          "})",
        ].join("\n");

  return `export const ${typeName}Attributes = ${declaration};
export type ${typeName}Attributes = typeof ${typeName}Attributes.Type;`;
};

const generateProductTypesSource = (
  schemas: readonly ProductTypeSchema[]
): string => {
  if (schemas.length === 0) {
    throw new Error("At least one Product Type schema is required");
  }

  const dependencies = new Set<ProductAttributeDependency>();
  const attributeSchemas = schemas.map((schema) =>
    generateProductAttributesSchema(schema, dependencies)
  );
  const supportedAttributeDependencies = [
    "ProductAttributeDate",
    "ProductAttributeDateTime",
    "makeProductAttributeEnumValueSchema",
    "ProductAttributeTime",
  ] as const satisfies readonly ProductAttributeDependency[];
  const attributeDependencies = supportedAttributeDependencies.filter(
    (dependency) => dependencies.has(dependency)
  );
  const attributeImport =
    attributeDependencies.length === 0
      ? ""
      : `import { ${attributeDependencies.join(", ")} } from "../attributes";\n`;
  const moneyImport = dependencies.has("Money")
    ? 'import { Money } from "../../domain/money";\n'
    : "";
  const productIdImport = dependencies.has("ProductId")
    ? 'import { ProductId } from "../identity";\n'
    : "";
  const productTypeKeys = schemas
    .map((schema) => {
      const typeKeyName = productTypeKeyName(schema.key);
      return `const ${typeKeyName} = Schema.Literal(${JSON.stringify(
        schema.key
      )}).pipe(
  Schema.brand("ProductTypeKey")
);
type ${typeKeyName} = typeof ${typeKeyName}.Type;`;
    })
    .join("\n\n");
  const productTypeKeyMembers = schemas
    .map((schema) => `  ${productTypeKeyName(schema.key)},`)
    .join("\n");
  const schemaMap = schemas
    .map(
      (schema) =>
        `  ${JSON.stringify(schema.key)}: ${toPascalCase(schema.key)}Attributes,`
    )
    .join("\n");
  const typeMap = schemas
    .map(
      (schema) =>
        `  readonly ${JSON.stringify(schema.key)}: ${toPascalCase(schema.key)}Attributes;`
    )
    .join("\n");
  const conditionalAttributes = schemas
    .map(
      (schema, index) =>
        `${index === 0 ? "" : "  : "}TKey extends ${productTypeKeyName(
          schema.key
        )}\n  ? ${toPascalCase(schema.key)}Attributes`
    )
    .join("\n");
  const variants = schemas
    .map((schema) => {
      const typeName = toPascalCase(schema.key);
      return `const ${productVariantName(schema.key)} = makeProductVariantSchema(
  ${typeName}Attributes
);`;
    })
    .join("\n");
  const variantMembers = schemas
    .map((schema) => `  ${productVariantName(schema.key)},`)
    .join("\n");
  const detailMembers = schemas
    .map(
      (schema) => `  makeProductDetailSchema(
    ${productTypeKeyName(schema.key)},
    ${productVariantName(schema.key)}
  ),`
    )
    .join("\n");

  return `// This file is generated. Do not edit it manually.
// Run \`pnpm cli commerce types generate\` to regenerate.

import { Schema } from "effect";
${moneyImport}${attributeImport}${productIdImport}import {
  hasCompleteProductOptionSelection,
  hasDefaultProductVariant,
  hasUniqueProductVariantIds,
  makeProductDetailSchema,
  makeProductVariantSchema,
} from "../model";

${productTypeKeys}

export const ProductTypeKey = Schema.Union([
${productTypeKeyMembers}
]);
export type ProductTypeKey = typeof ProductTypeKey.Type;

${attributeSchemas.join("\n\n")}

export const ProductAttributesSchemaByProductType = {
${schemaMap}
} as const;

export type ProductAttributesByProductType = {
${typeMap}
};

export type ProductAttributes<
  TKey extends ProductTypeKey = ProductTypeKey,
> = ${conditionalAttributes}
  : never;

${variants}

export const ProductVariant = Schema.Union([
${variantMembers}
]);

const ProductDetailSchema = Schema.Union([
${detailMembers}
]);

export const ProductDetail = ProductDetailSchema.check(
  Schema.makeFilter(hasDefaultProductVariant, {
    expected: "defaultVariantId to identify a Product Variant",
  }),
  Schema.makeFilter(hasUniqueProductVariantIds, {
    expected: "unique Product Variant IDs",
  }),
  Schema.makeFilter(hasCompleteProductOptionSelection, {
    expected:
      "every Product Variant to select one defined value for every Product Option",
  })
);

type ProductDetailForKey<Detail, TKey extends ProductTypeKey> = Detail extends {
  readonly productType: TKey;
}
  ? Detail
  : never;

export type ProductDetail<TKey extends ProductTypeKey = ProductTypeKey> =
  ProductDetailForKey<typeof ProductDetail.Type, TKey>;

export type ProductVariant<TKey extends ProductTypeKey = ProductTypeKey> =
  ProductDetail<TKey>["variants"][number];
`;
};

export const generateProductTypes = async (
  schemaDirectory: string,
  outputDirectory: string
): Promise<void> => {
  const schemas = await readSchemas(schemaDirectory, ProductTypeSchema);
  await mkdir(outputDirectory, { recursive: true });

  await writeFile(
    path.join(outputDirectory, "attributes.ts"),
    generateProductTypesSource(schemas),
    "utf-8"
  );
};
