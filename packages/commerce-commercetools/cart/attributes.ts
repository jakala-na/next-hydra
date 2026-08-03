import type { Locale } from "@repo/i18n/types";

export type AttributeRaw = {
  readonly name: string;
  readonly value: unknown;
};

type LocalizedString = Record<string, string>;

type LocalizedEnumValue = {
  key: string;
  label: LocalizedString;
};

type EnumValue = {
  key: string;
  label: string;
};

type ProductAttribute<
  T extends "lenum" | "enum" | "ltext" | "text" | "number" | "boolean",
> = {
  name: string;
  value: T extends "lenum"
    ? LocalizedEnumValue
    : T extends "enum"
      ? EnumValue
      : T extends "ltext"
        ? LocalizedString
        : T extends "text"
          ? string
          : T extends "number"
            ? number
            : T extends "boolean"
              ? boolean
              : never;
};

// Map product type keys to their specific attribute schema
export type AttributesSchemasByProductType = {
  "heavy-earthmoving-and-construction-equipment": AttributesSchemaHeavyEarthmovingEquipment;
  "heavy-lifting-and-specialized-equipment": AttributesSchemaHeavyLiftingEquipment;
  "generic-product": AttributesSchemaGenericProduct;
};

export type ProductTypeKey = keyof AttributesSchemasByProductType;

export type AttributesSchema<TKey extends ProductTypeKey = ProductTypeKey> =
  AttributesSchemasByProductType[TKey];

export type AttributesSchemaHeavyEarthmovingEquipment = {
  // Same for all constraint
  capacity: ProductAttribute<"number">;
  iso45001: ProductAttribute<"boolean">;
  mobility: ProductAttribute<"enum">;
  // Unique constraint
  model: ProductAttribute<"number">;
};

export type AttributesSchemaHeavyLiftingEquipment = {
  // Same for all constraint
  capacity: ProductAttribute<"number">;
  iso45001: ProductAttribute<"boolean">;
  mobility: ProductAttribute<"enum">;
  // Unique constraint
  color: ProductAttribute<"lenum">;
};

export type AttributesSchemaGenericProduct = Record<string, never>;

type ExtractedLocalizedValue<TAttr> =
  TAttr extends ProductAttribute<infer K>
    ? K extends "lenum"
      ? EnumValue
      : K extends "enum"
        ? EnumValue
        : K extends "ltext"
          ? string
          : K extends "text"
            ? string
            : K extends "number"
              ? number
              : K extends "boolean"
                ? boolean
                : never
    : never;

export type ExtractedAttributes<TKey extends ProductTypeKey = ProductTypeKey> =
  {
    [K in keyof AttributesSchema<TKey>]?: ExtractedLocalizedValue<
      AttributesSchema<TKey>[K]
    >;
  };

// Product attributes keyed by product type
export type ProductAttributesByProductType = {
  "heavy-earthmoving-and-construction-equipment": {
    capacity?: number;
    iso45001?: boolean;
    mobility?: EnumValue;
    model?: number;
  };
  "heavy-lifting-and-specialized-equipment": {
    capacity?: number;
    iso45001?: boolean;
    mobility?: EnumValue;
    color?: EnumValue;
  };
  "generic-product": Record<string, never>;
};

export type ProductAttributes<TKey extends ProductTypeKey = ProductTypeKey> =
  ProductAttributesByProductType[TKey];

const isLocalizedEnumValue = (value: unknown): value is LocalizedEnumValue =>
  typeof value === "object" &&
  value !== null &&
  "key" in value &&
  "label" in value &&
  typeof (value as { key: unknown }).key === "string" &&
  typeof (value as { label: unknown }).label === "object";

const isLocalizedString = (value: unknown): value is Record<string, string> => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  for (const v of Object.values(value as Record<string, unknown>)) {
    if (typeof v !== "string") {
      return false;
    }
  }
  return true;
};

const localize = (ls: Record<string, string>, locale: Locale): string =>
  ls[locale] ?? "";

export function extractAttributeValue<
  TKey extends ProductTypeKey,
  TName extends keyof AttributesSchema<TKey>,
>(
  productTypeKey: TKey,
  attributeName: TName,
  attributeValue: unknown,
  locale: Locale
): ExtractedLocalizedValue<AttributesSchema<TKey>[TName]>;
export function extractAttributeValue(
  productTypeKey: string,
  attributeName: string,
  attributeValue: unknown,
  locale: Locale
): unknown;
export function extractAttributeValue(
  _productTypeKey: string,
  _attributeName: string,
  attributeValue: unknown,
  locale: Locale
): unknown {
  if (isLocalizedEnumValue(attributeValue)) {
    return {
      key: attributeValue.key,
      label: localize(attributeValue.label, locale),
    };
  }

  if (Array.isArray(attributeValue)) {
    return attributeValue.map((value) =>
      extractAttributeValue(_productTypeKey, _attributeName, value, locale)
    );
  }

  if (isLocalizedString(attributeValue)) {
    return localize(attributeValue, locale);
  }

  return attributeValue;
}

export function getAttributesForLocale<TKey extends ProductTypeKey>(
  productTypeKey: TKey,
  attributesRaw: AttributeRaw[],
  locale: Locale
): ExtractedAttributes<TKey>;
export function getAttributesForLocale(
  productTypeKey: string,
  attributesRaw: AttributeRaw[],
  locale: Locale
): Record<string, unknown>;
export function getAttributesForLocale(
  productTypeKey: string,
  attributesRaw: AttributeRaw[],
  locale: Locale
): Record<string, unknown> {
  const attributes: Record<string, unknown> = {};
  for (const attribute of attributesRaw) {
    attributes[attribute.name] = extractAttributeValue(
      productTypeKey,
      attribute.name,
      attribute.value,
      locale
    );
  }
  return attributes;
}

export function reshapeProductAttributes<TKey extends ProductTypeKey>(
  productTypeKey: TKey,
  attributesRaw: AttributeRaw[],
  locale: Locale
): ProductAttributes<TKey> {
  const attributes = getAttributesForLocale(
    productTypeKey,
    attributesRaw,
    locale
  );
  if (productTypeKey === "heavy-earthmoving-and-construction-equipment") {
    const a =
      attributes as ExtractedAttributes<"heavy-earthmoving-and-construction-equipment">;
    return {
      capacity: a.capacity,
      iso45001: a.iso45001,
      mobility: a.mobility,
      model: a.model,
    } as ProductAttributes<TKey>;
  }
  if (productTypeKey === "heavy-lifting-and-specialized-equipment") {
    const a =
      attributes as ExtractedAttributes<"heavy-lifting-and-specialized-equipment">;
    return {
      capacity: a.capacity,
      iso45001: a.iso45001,
      mobility: a.mobility,
      color: a.color,
    } as ProductAttributes<TKey>;
  }
  return {} as ProductAttributes<TKey>;
}
