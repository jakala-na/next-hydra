import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

type CustomTypeFieldDefinition = {
  readonly name: string;
  readonly label: Record<string, string>;
  readonly type: {
    readonly name:
      | "String"
      | "LocalizedString"
      | "Number"
      | "Boolean"
      | "DateTime"
      | "Enum"
      | "LocalizedEnum"
      | "Set"
      | "Reference";
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

type GeneratedCustomFieldKind =
  | "text"
  | "ltext"
  | "number"
  | "boolean"
  | "datetime"
  | "enum"
  | "lenum"
  | "reference"
  | "referenceSet";

const CASE_SEPARATOR = /[-_]/;
const FILE_EXTENSION = ".json";

const toPascalCase = (value: string): string =>
  value
    .split(CASE_SEPARATOR)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");

const toCamelCase = (value: string): string => {
  const pascalCase = toPascalCase(value);
  return pascalCase.charAt(0).toLowerCase() + pascalCase.slice(1);
};

const escapeLiteral = (value: string): string =>
  value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');

const readSchemas = async <TSchema>(directory: string): Promise<TSchema[]> => {
  let files: string[];
  try {
    files = await readdir(directory);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const schemas: TSchema[] = [];
  for (const file of files
    .filter((candidate) => candidate.endsWith(FILE_EXTENSION))
    .sort()) {
    schemas.push(
      JSON.parse(await readFile(join(directory, file), "utf8")) as TSchema
    );
  }
  return schemas;
};

const customFieldKind = (
  fieldType: CustomTypeFieldDefinition["type"]
): GeneratedCustomFieldKind => {
  switch (fieldType.name) {
    case "LocalizedEnum":
      return "lenum";
    case "Enum":
      return "enum";
    case "LocalizedString":
      return "ltext";
    case "Number":
      return "number";
    case "Boolean":
      return "boolean";
    case "DateTime":
      return "datetime";
    case "Reference":
      return "reference";
    case "Set":
      return fieldType.elementType?.name === "Reference"
        ? "referenceSet"
        : customFieldKind(fieldType.elementType ?? { name: "String" });
    default:
      return "text";
  }
};

const customFieldTypeKind = (
  fieldType: CustomTypeFieldDefinition["type"]
): "text" | "ltext" | "number" | "boolean" | "datetime" | "enum" | "lenum" => {
  const kind = customFieldKind(fieldType);
  if (kind === "reference" || kind === "referenceSet") {
    return "text";
  }
  return kind;
};

const enumValues = (
  fieldType: CustomTypeFieldDefinition["type"]
): readonly string[] => {
  if (fieldType.name === "Enum" || fieldType.name === "LocalizedEnum") {
    return (fieldType.values ?? []).map((value) => value.key);
  }
  if (fieldType.name === "Set" && fieldType.elementType) {
    return enumValues(fieldType.elementType);
  }
  return [];
};

const enumTypeName = (schemaKey: string, fieldName: string): string =>
  `${toPascalCase(schemaKey)}${toPascalCase(fieldName)}Enum`;

const generateCustomType = (schema: CustomTypeSchema): string => {
  const fields = schema.fieldDefinitions ?? [];
  if (fields.length === 0) {
    return `export type ${toPascalCase(schema.key)}Schema = Record<string, never>;`;
  }

  const aliases = fields.flatMap((field) => {
    const values = enumValues(field.type);
    if (values.length === 0) {
      return [];
    }
    return [
      `export type ${enumTypeName(schema.key, field.name)} = ${values
        .map((value) => `"${escapeLiteral(value)}"`)
        .join(" | ")};`,
    ];
  });

  const properties = fields.map((field) => {
    const kind = customFieldTypeKind(field.type);
    const values = enumValues(field.type);
    const enumParameter =
      values.length === 0 ? "" : `, ${enumTypeName(schema.key, field.name)}`;
    return `  ${field.name}: CustomField<"${kind}"${enumParameter}>;`;
  });

  const schemaType = [
    `export type ${toPascalCase(schema.key)}Schema = {`,
    ...properties,
    "};",
  ].join("\n");

  return [...aliases, schemaType].join("\n\n");
};

const enumConstName = (schemaKey: string): string =>
  `${toCamelCase(schemaKey)}EnumFieldValues`;

const customFieldsOwnerTypeName = (schemaKey: string): string => {
  const typeName = toPascalCase(schemaKey);
  const suffix = "CustomFields";
  return typeName.endsWith(suffix)
    ? typeName.slice(0, -suffix.length)
    : typeName;
};

const fieldKindsConstName = (schemaKey: string): string =>
  `${toCamelCase(customFieldsOwnerTypeName(schemaKey))}CustomFieldKinds`;

const generateEnumValues = (schema: CustomTypeSchema): string => {
  const rows = (schema.fieldDefinitions ?? []).flatMap((field) => {
    const values = enumValues(field.type);
    if (values.length === 0) {
      return [];
    }
    return [
      `  ${field.name}: [${values
        .map((value) => `"${escapeLiteral(value)}"`)
        .join(", ")}],`,
    ];
  });

  if (rows.length === 0) {
    return `export const ${enumConstName(schema.key)} = {} as const;`;
  }

  return [
    `export const ${enumConstName(schema.key)} = {`,
    ...rows,
    "} as const;",
  ].join("\n");
};

const generateFieldKinds = (schema: CustomTypeSchema): string => {
  const rows = (schema.fieldDefinitions ?? []).map(
    (field) => `  ${field.name}: "${customFieldKind(field.type)}",`
  );

  if (rows.length === 0) {
    return `export const ${fieldKindsConstName(schema.key)} = {} as const;`;
  }

  return [
    `export const ${fieldKindsConstName(schema.key)} = {`,
    ...rows,
    "} as const;",
  ].join("\n");
};

const generateCustomFieldHelpers = (schema: CustomTypeSchema): string => {
  const typeName = toPascalCase(schema.key);
  const ownerTypeName = customFieldsOwnerTypeName(schema.key);
  const valuesName = enumConstName(schema.key);

  return `export const get${ownerTypeName}CustomFields = <
  TLocale extends Locale = Locale,
>(
  customFieldsRaw: CustomFieldRaw[],
  locale: TLocale,
  defaultLocale?: Locale
): ExtractedCustomFields<${typeName}Schema> =>
  getCustomFieldsForLocale<${typeName}Schema>(
    customFieldsRaw,
    locale,
    defaultLocale
  );

export const resolve${ownerTypeName}CustomField = <
  TField extends keyof ${typeName}Schema,
  TLocale extends Locale = Locale,
>(
  customFieldsRaw: CustomFieldRaw[] | null | undefined,
  fieldName: TField,
  locale: TLocale,
  defaultLocale?: Locale
): ExtractedCustomFields<${typeName}Schema>[TField] => {
  const allowedEnumValues = (
    ${valuesName} as Partial<
      Record<keyof ${typeName}Schema, readonly string[]>
    >
  )[fieldName];

  return resolveTypedCustomFieldValue<
    ExtractedCustomFields<${typeName}Schema>[TField]
  >(customFieldsRaw, fieldName as string, {
    locale,
    defaultLocale,
    allowedEnumValues,
  });
};`;
};

export const generateCustomTypes = async (
  schemaDirectory: string,
  outputDirectory: string
): Promise<void> => {
  const schemas = await readSchemas<CustomTypeSchema>(schemaDirectory);
  await mkdir(outputDirectory, { recursive: true });

  const types = schemas.map(generateCustomType).join("\n\n");
  const enumDefinitions = schemas.map(generateEnumValues).join("\n\n");
  const fieldKindDefinitions = schemas.map(generateFieldKinds).join("\n\n");
  const helpers = schemas.map(generateCustomFieldHelpers).join("\n\n");

  const schemaTypeImports = schemas
    .map(
      (schema) =>
        `import type { ${toPascalCase(schema.key)}Schema } from "./types";`
    )
    .join("\n");
  const enumImports = schemas
    .map((schema) => enumConstName(schema.key))
    .join(", ");

  await Promise.all([
    writeFile(
      join(outputDirectory, "types.ts"),
      `// This file is auto-generated. Do not edit manually.
// Run \`pnpm cli commerce types generate\` to regenerate.

import type { CustomField } from "../types";
${types.length === 0 ? "" : `\n${types}`}
`,
      "utf8"
    ),
    writeFile(
      join(outputDirectory, "enum-values.ts"),
      `// This file is auto-generated. Do not edit manually.
// Run \`pnpm cli commerce types generate\` to regenerate.

${enumDefinitions}
`,
      "utf8"
    ),
    writeFile(
      join(outputDirectory, "field-kinds.ts"),
      `// This file is auto-generated. Do not edit manually.
// Run \`pnpm cli commerce types generate\` to regenerate.

export type GeneratedCustomFieldKind =
  | "text"
  | "ltext"
  | "number"
  | "boolean"
  | "datetime"
  | "enum"
  | "lenum"
  | "reference"
  | "referenceSet";

${fieldKindDefinitions}
`,
      "utf8"
    ),
    writeFile(
      join(outputDirectory, "schemas.ts"),
      `// This file is auto-generated. Do not edit manually.
// Run \`pnpm cli commerce types generate\` to regenerate.

import type { Locale } from "@repo/i18n/types";
import { resolveTypedCustomFieldValue } from "../resolve";
import type { CustomFieldRaw, ExtractedCustomFields } from "../types";
import { getCustomFieldsForLocale } from "../utils";
import { ${enumImports} } from "./enum-values";
${schemaTypeImports}

${helpers}
`,
      "utf8"
    ),
  ]);
};

type ProductAttributeDependency =
  | "Money"
  | "ProductAttributeDate"
  | "ProductAttributeDateTime"
  | "ProductAttributeEnumValue"
  | "ProductAttributeTime"
  | "ProductId";

const TYPESCRIPT_IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

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
    case "ltext":
      return "Schema.String";
    case "number":
      return "Schema.Number";
    case "boolean":
      return "Schema.Boolean";
    case "enum":
    case "lenum":
      dependencies.add("ProductAttributeEnumValue");
      return "ProductAttributeEnumValue";
    case "money":
      dependencies.add("Money");
      return "Money";
    case "date":
      dependencies.add("ProductAttributeDate");
      return "ProductAttributeDate";
    case "time":
      dependencies.add("ProductAttributeTime");
      return "ProductAttributeTime";
    case "datetime":
      dependencies.add("ProductAttributeDateTime");
      return "ProductAttributeDateTime";
    case "reference":
      if (attributeType.referenceTypeId !== "product") {
        throw new Error(
          `Unsupported Product Attribute reference type: ${attributeType.referenceTypeId ?? "unknown"}`
        );
      }
      dependencies.add("ProductId");
      return "ProductId";
    case "set": {
      if (attributeType.elementType === undefined) {
        throw new Error("Product Attribute set has no element type");
      }
      return `Schema.Array(${productAttributeSchema(
        attributeType.elementType,
        dependencies
      )})`;
    }
    default:
      throw new Error(
        `Unsupported Product Attribute type: ${attributeType.name}`
      );
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
  const attributeDependencies = [
    "ProductAttributeDate",
    "ProductAttributeDateTime",
    "ProductAttributeEnumValue",
    "ProductAttributeTime",
  ].filter((dependency) =>
    dependencies.has(dependency as ProductAttributeDependency)
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
  const schemas = await readSchemas<ProductTypeSchema>(schemaDirectory);
  await mkdir(outputDirectory, { recursive: true });

  await writeFile(
    join(outputDirectory, "attributes.ts"),
    generateProductTypesSource(schemas),
    "utf8"
  );
};
