import type { Locale } from "@repo/i18n/types";
import type {
  CustomField,
  CustomFieldRaw,
  EnumValue,
  ExtractedCustomFields,
  LocalizedEnumValue,
  LocalizedString,
} from "./types";

const isLocalizedEnumValue = (value: unknown): value is LocalizedEnumValue =>
  typeof value === "object" &&
  value !== null &&
  "key" in value &&
  typeof value.key === "string" &&
  "label" in value &&
  typeof value.label === "object" &&
  value.label !== null;

const isEnumValue = (value: unknown): value is EnumValue =>
  typeof value === "object" &&
  value !== null &&
  "key" in value &&
  typeof value.key === "string" &&
  "label" in value &&
  typeof value.label === "string";

const isLocalizedString = (value: unknown): value is LocalizedString => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  return Object.values(value).every((entry) => typeof entry === "string");
};

const localize = (
  value: LocalizedString,
  locale: Locale,
  defaultLocale?: Locale
): string =>
  value[locale] ??
  (defaultLocale === undefined ? undefined : value[defaultLocale]) ??
  Object.values(value).find((entry) => entry.trim().length > 0) ??
  "";

const extractCustomFieldValue = (
  value: unknown,
  locale: Locale,
  defaultLocale?: Locale
): unknown => {
  if (isLocalizedEnumValue(value) || isEnumValue(value)) {
    return value.key;
  }

  if (Array.isArray(value)) {
    return value.map((entry) =>
      extractCustomFieldValue(entry, locale, defaultLocale)
    );
  }

  if (isLocalizedString(value)) {
    return localize(value, locale, defaultLocale);
  }

  return value;
};

export const getCustomFieldsForLocale = <
  TSchema extends Record<
    string,
    CustomField<
      "lenum" | "enum" | "ltext" | "text" | "number" | "boolean" | "datetime"
    >
  >,
>(
  customFieldsRaw: readonly CustomFieldRaw[],
  locale: Locale,
  defaultLocale?: Locale
): ExtractedCustomFields<TSchema> => {
  const fields: Record<string, unknown> = {};

  for (const customField of customFieldsRaw) {
    fields[customField.name] = extractCustomFieldValue(
      customField.value,
      locale,
      defaultLocale
    );
  }

  return fields as ExtractedCustomFields<TSchema>;
};
