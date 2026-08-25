import type { Locale } from "@repo/i18n/types";

import type { CustomFieldRaw } from "./types";
import { getCustomFieldsForLocale } from "./utils";

export const resolveTypedCustomFieldValue = <TValue>(
  customFieldsRaw: readonly CustomFieldRaw[] | null | undefined,
  fieldName: string,
  options: {
    readonly locale: Locale;
    readonly defaultLocale?: Locale;
    readonly allowedEnumValues?: readonly string[];
  }
): TValue | undefined => {
  if (!customFieldsRaw) {
    return undefined;
  }

  const values = getCustomFieldsForLocale<
    Record<
      string,
      {
        readonly name: string;
        readonly value: string;
      }
    >
  >(customFieldsRaw, options.locale, options.defaultLocale);
  const value = values[fieldName];

  if (
    options.allowedEnumValues &&
    options.allowedEnumValues.length > 0 &&
    (typeof value !== "string" || !options.allowedEnumValues.includes(value))
  ) {
    return undefined;
  }

  return value as TValue | undefined;
};
