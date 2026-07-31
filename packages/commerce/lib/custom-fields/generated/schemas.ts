// This file is auto-generated. Do not edit manually.
// Run `pnpm cli commerce types generate` to regenerate.

import type { Locale } from "@repo/i18n/types";
import { resolveTypedCustomFieldValue } from "../resolve";
import type { CustomFieldRaw, ExtractedCustomFields } from "../types";
import { getCustomFieldsForLocale } from "../utils";
import { orderCustomFieldsEnumFieldValues } from "./enum-values";
import type { OrderCustomFieldsSchema } from "./types";

export const getOrderCustomFields = <
  TLocale extends Locale = Locale,
>(
  customFieldsRaw: CustomFieldRaw[],
  locale: TLocale,
  defaultLocale?: Locale
): ExtractedCustomFields<OrderCustomFieldsSchema> =>
  getCustomFieldsForLocale<OrderCustomFieldsSchema>(
    customFieldsRaw,
    locale,
    defaultLocale
  );

export const resolveOrderCustomField = <
  TField extends keyof OrderCustomFieldsSchema,
  TLocale extends Locale = Locale,
>(
  customFieldsRaw: CustomFieldRaw[] | null | undefined,
  fieldName: TField,
  locale: TLocale,
  defaultLocale?: Locale
): ExtractedCustomFields<OrderCustomFieldsSchema>[TField] => {
  const allowedEnumValues = (
    orderCustomFieldsEnumFieldValues as Partial<
      Record<keyof OrderCustomFieldsSchema, readonly string[]>
    >
  )[fieldName];

  return resolveTypedCustomFieldValue<
    ExtractedCustomFields<OrderCustomFieldsSchema>[TField]
  >(customFieldsRaw, fieldName as string, {
    locale,
    defaultLocale,
    allowedEnumValues,
  });
};
