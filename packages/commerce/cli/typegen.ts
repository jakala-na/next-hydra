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

type ProductTypeAttribute = {
  readonly name: string;
  readonly type: {
    readonly name: string;
    readonly elementType?: ProductTypeAttribute["type"];
  };
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

const productAttributeKind = (
  attributeType: ProductTypeAttribute["type"]
): "text" | "ltext" | "number" | "boolean" | "enum" | "lenum" => {
  switch (attributeType.name) {
    case "ltext":
      return "ltext";
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "enum":
      return "enum";
    case "lenum":
      return "lenum";
    case "set":
      return productAttributeKind(
        attributeType.elementType ?? { name: "text" }
      );
    default:
      return "text";
  }
};

const generateProductType = (schema: ProductTypeSchema): string => {
  const attributes = schema.attributes ?? [];
  if (attributes.length === 0) {
    return `export type ${toPascalCase(schema.key)}AttributesSchema = Record<string, never>;`;
  }

  return [
    `export type ${toPascalCase(schema.key)}AttributesSchema = {`,
    ...attributes.map(
      (attribute) =>
        `  ${attribute.name}: ProductAttribute<"${productAttributeKind(
          attribute.type
        )}">${attribute.type.name === "set" ? "[]" : ""};`
    ),
    "};",
  ].join("\n");
};

export const generateProductTypes = async (
  schemaDirectory: string,
  outputDirectory: string
): Promise<void> => {
  const schemas = await readSchemas<ProductTypeSchema>(schemaDirectory);
  await mkdir(outputDirectory, { recursive: true });

  await writeFile(
    join(outputDirectory, "attributes.ts"),
    `// This file is auto-generated. Do not edit manually.
// Run \`pnpm cli commerce types generate\` to regenerate.

import type { ProductAttribute } from "../types";
${schemas.length === 0 ? "" : `\n${schemas.map(generateProductType).join("\n\n")}`}
`,
    "utf8"
  );
};
