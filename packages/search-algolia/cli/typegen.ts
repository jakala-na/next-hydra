import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { Schema } from "effect";

const ProductAttributeElementType = Schema.Struct({ name: Schema.String });
const ProductAttributeType = Schema.Struct({
  elementType: Schema.optional(ProductAttributeElementType),
  name: Schema.String,
});
type ProductAttributeType = typeof ProductAttributeType.Type;
const ProductTypeAttribute = Schema.Struct({
  attributeConstraint: Schema.optional(Schema.String),
  name: Schema.String,
  type: ProductAttributeType,
});
const ProductTypeSchema = Schema.Struct({
  attributes: Schema.optional(Schema.Array(ProductTypeAttribute)),
  key: Schema.String,
});
type ProductTypeSchema = typeof ProductTypeSchema.Type;

const propertyName = (value: string): string => JSON.stringify(value);

const valueType = (attributeType: ProductAttributeType): string => {
  switch (attributeType.name) {
    case "boolean": {
      return "boolean";
    }
    case "number": {
      return "number";
    }
    case "lenum":
    case "ltext": {
      return "LocalizedStringByAlgoliaConnectorLocale";
    }
    case "enum":
    case "reference":
    case "text": {
      return "string";
    }
    case "set": {
      if (attributeType.elementType === undefined) {
        throw new Error("Product Attribute set has no element type");
      }
      return `readonly ${valueType(attributeType.elementType)}[]`;
    }
    default: {
      throw new Error(
        `Unsupported Product Attribute type for Algolia: ${attributeType.name}`
      );
    }
  }
};

const collectAttributeTypes = (
  schemas: readonly ProductTypeSchema[],
  scope: "root" | "variant"
): Map<string, string> => {
  const fields = new Map<string, string>();
  for (const schema of schemas) {
    for (const attribute of schema.attributes ?? []) {
      const attributeScope =
        attribute.attributeConstraint === "SameForAll" ? "root" : "variant";
      if (attributeScope !== scope) {
        continue;
      }
      const type = valueType(attribute.type);
      const existing = fields.get(attribute.name);
      if (existing !== undefined && existing !== type) {
        throw new Error(
          `Product Attribute ${attribute.name} has incompatible Algolia types ${existing} and ${type}`
        );
      }
      fields.set(attribute.name, type);
    }
  }
  return fields;
};

const typeProperties = (fields: Map<string, string>): string => {
  if (fields.size === 0) {
    return "  readonly [key: string]: never;";
  }
  const entries = [...fields.entries()];
  // oxlint-disable-next-line unicorn/no-array-sort -- generated output must be stable across schema file ordering
  entries.sort(([left], [right]) => left.localeCompare(right));
  return entries
    .map(([name, type]) => `  readonly ${propertyName(name)}?: ${type};`)
    .join("\n");
};

export const buildAlgoliaCommercetoolsProductSource = (
  schemas: readonly ProductTypeSchema[],
  locales: readonly string[],
  currencies: readonly string[]
): string => {
  if (schemas.length === 0) {
    throw new Error("At least one Product Type schema is required");
  }
  if (locales.length === 0) {
    throw new Error("At least one commerce locale is required");
  }
  if (currencies.length === 0) {
    throw new Error("At least one commerce currency is required");
  }
  const rootAttributes = collectAttributeTypes(schemas, "root");
  const variantAttributes = collectAttributeTypes(schemas, "variant");
  const localeRows = locales
    .map((locale) => `  ${JSON.stringify(locale)},`)
    .join("\n");
  const currencyRows = currencies
    .map((currency) => `  ${JSON.stringify(currency)},`)
    .join("\n");

  return `// This file is generated. Do not edit it manually.
// Run \`pnpm cli search types generate\` to regenerate.

import type { FieldPath } from "@repo/commerce/product";

export const ALGOLIA_CONNECTOR_LOCALES = [
${localeRows}
] as const;
export type AlgoliaConnectorLocale =
  (typeof ALGOLIA_CONNECTOR_LOCALES)[number];

export const ALGOLIA_CONNECTOR_CURRENCIES = [
${currencyRows}
] as const;
export type AlgoliaConnectorCurrency =
  (typeof ALGOLIA_CONNECTOR_CURRENCIES)[number];

export const isAlgoliaConnectorCurrency = (
  currency: string
): currency is AlgoliaConnectorCurrency =>
  ALGOLIA_CONNECTOR_CURRENCIES.some(
    (candidate: string) => candidate === currency
  );

export const algoliaConnectorCurrency = (
  currency: string
): AlgoliaConnectorCurrency => {
  if (!isAlgoliaConnectorCurrency(currency)) {
    throw new Error(\`Unsupported Algolia connector currency \${currency}\`);
  }
  return currency;
};

export const isAlgoliaConnectorLocale = (
  locale: string
): locale is AlgoliaConnectorLocale =>
  ALGOLIA_CONNECTOR_LOCALES.some((candidate: string) => candidate === locale);

export const algoliaConnectorLocale = (
  locale: string
): AlgoliaConnectorLocale => {
  if (!isAlgoliaConnectorLocale(locale)) {
    throw new Error(\`Unsupported Algolia connector locale \${locale}\`);
  }
  return locale;
};

export type LocalizedStringByAlgoliaConnectorLocale = Partial<
  Record<AlgoliaConnectorLocale, string>
>;

export interface AlgoliaCommercetoolsRootAttributes {
${typeProperties(rootAttributes)}
}

export interface AlgoliaCommercetoolsVariantAttributes {
${typeProperties(variantAttributes)}
}

export interface AlgoliaCommercetoolsRawPriceValue {
  readonly channelID?: string;
  readonly customerGroupID?: string;
  readonly discountedValue?: number;
  readonly discountID?: string;
  readonly id: string;
  readonly value: number;
}

export interface AlgoliaCommercetoolsRawPriceBucket {
  readonly max?: number;
  readonly min: number;
  readonly priceValues?: readonly AlgoliaCommercetoolsRawPriceValue[];
}

export interface AlgoliaCommercetoolsImageObject {
  readonly dimensions?: {
    readonly height: number;
    readonly width: number;
  };
  readonly label?: string;
  readonly url: string;
}

export type AlgoliaCommercetoolsImage = string | AlgoliaCommercetoolsImageObject;

export interface AlgoliaCommercetoolsRawVariant {
  readonly attributes?: AlgoliaCommercetoolsVariantAttributes;
  readonly id: string;
  readonly images?: readonly AlgoliaCommercetoolsImage[];
  readonly isInStock?: boolean;
  readonly key?: string;
  readonly prices?: Partial<
    Record<AlgoliaConnectorCurrency, AlgoliaCommercetoolsRawPriceBucket>
  >;
  readonly sku?: string;
}

export interface AlgoliaCommercetoolsRawProduct {
  readonly attributes?: AlgoliaCommercetoolsRootAttributes;
  readonly categories?: Partial<
    Record<
      AlgoliaConnectorLocale,
      Readonly<Record<string, readonly string[]>>
    >
  >;
  readonly categoryKeys?: Partial<
    Record<AlgoliaConnectorLocale, readonly string[]>
  >;
  readonly description?: LocalizedStringByAlgoliaConnectorLocale;
  readonly key?: string;
  readonly name?: LocalizedStringByAlgoliaConnectorLocale;
  readonly objectID: string;
  readonly productType?: string;
  readonly slug?: LocalizedStringByAlgoliaConnectorLocale;
  readonly variants: readonly AlgoliaCommercetoolsRawVariant[];
}

export interface AlgoliaProductCategory {
  readonly key: string;
  readonly label: LocalizedStringByAlgoliaConnectorLocale;
}

export interface AlgoliaProductMoney {
  readonly centAmount: number;
  readonly currencyCode: AlgoliaConnectorCurrency;
}

export interface AlgoliaProductCardRecord {
  readonly availableForSale: boolean;
  readonly description?: LocalizedStringByAlgoliaConnectorLocale;
  readonly featuredImage?: {
    readonly altText?: string;
    readonly url: string;
  };
  readonly id: string;
  readonly slug: LocalizedStringByAlgoliaConnectorLocale;
  readonly startingPrice?: Partial<
    Record<AlgoliaConnectorCurrency, AlgoliaProductMoney>
  >;
  readonly title: LocalizedStringByAlgoliaConnectorLocale;
}

export interface AlgoliaProductVariantRecord {
  readonly attributes?: AlgoliaCommercetoolsVariantAttributes;
  readonly id: string;
  readonly key?: string;
  readonly sku?: string;
}

/** Provider record stored once per Product price-audience slice. */
export interface AlgoliaProductRecord {
  readonly attributes?: AlgoliaCommercetoolsRootAttributes;
  readonly availability: "in-stock" | "out-of-stock";
  readonly categories: readonly AlgoliaProductCategory[];
  readonly category: Partial<
    Record<AlgoliaConnectorLocale, readonly string[]>
  >;
  readonly priceAudienceIds: readonly string[];
  readonly objectID: string;
  readonly price?: Partial<Record<AlgoliaConnectorCurrency, number>>;
  readonly productCard: AlgoliaProductCardRecord;
  readonly variants: readonly AlgoliaProductVariantRecord[];
}

export type AlgoliaCommercetoolsProductFieldPath =
  FieldPath<AlgoliaCommercetoolsRawProduct>;

export type AlgoliaProductFieldPath = FieldPath<AlgoliaProductRecord>;

export const algoliaProductFieldPath = <Path extends AlgoliaProductFieldPath>(
  path: Path
): Path => path;
`;
};

export const readAlgoliaProductTypeSchemas = async (
  schemaDirectory: string
): Promise<readonly ProductTypeSchema[]> => {
  const directoryEntries = await readdir(schemaDirectory);
  const files = directoryEntries.filter((file) => file.endsWith(".json"));
  // oxlint-disable-next-line unicorn/no-array-sort -- filesystem enumeration order is not portable
  files.sort();
  return await Promise.all(
    files.map(async (file) => {
      const source = await readFile(path.join(schemaDirectory, file), "utf-8");
      const decoded: unknown = JSON.parse(source);
      return Schema.decodeUnknownSync(ProductTypeSchema)(decoded);
    })
  );
};

export const generateAlgoliaCommercetoolsProductTypes = async (options: {
  readonly currencies: readonly string[];
  readonly locales: readonly string[];
  readonly outputFile: string;
  readonly schemaDirectory: string;
}): Promise<void> => {
  const schemas = await readAlgoliaProductTypeSchemas(options.schemaDirectory);
  const source = buildAlgoliaCommercetoolsProductSource(
    schemas,
    options.locales,
    options.currencies
  );
  await mkdir(path.dirname(options.outputFile), { recursive: true });
  await writeFile(options.outputFile, source, "utf-8");
};
