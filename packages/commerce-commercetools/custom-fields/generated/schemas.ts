// This file is auto-generated. Do not edit manually.
// Run `pnpm cli commerce types generate` to regenerate.

import type { Locale } from "@repo/i18n/types";
import { resolveTypedCustomFieldValue } from "../resolve";
import type { CustomFieldRaw, ExtractedCustomFields } from "../types";
import { getCustomFieldsForLocale } from "../utils";
import { checkoutPaymentFieldsEnumFieldValues, orderCustomFieldsEnumFieldValues } from "./enum-values";
import type { CheckoutPaymentFieldsSchema } from "./types";
import type { OrderCustomFieldsSchema } from "./types";

export const getCheckoutPaymentFieldsCustomFields = <
  TLocale extends Locale = Locale,
>(
  customFieldsRaw: CustomFieldRaw[],
  locale: TLocale,
  defaultLocale?: Locale
): ExtractedCustomFields<CheckoutPaymentFieldsSchema> =>
  getCustomFieldsForLocale<CheckoutPaymentFieldsSchema>(
    customFieldsRaw,
    locale,
    defaultLocale
  );

export const resolveCheckoutPaymentFieldsCustomField = <
  TField extends keyof CheckoutPaymentFieldsSchema,
  TLocale extends Locale = Locale,
>(
  customFieldsRaw: CustomFieldRaw[] | null | undefined,
  fieldName: TField,
  locale: TLocale,
  defaultLocale?: Locale
): ExtractedCustomFields<CheckoutPaymentFieldsSchema>[TField] => {
  const allowedEnumValues = (
    checkoutPaymentFieldsEnumFieldValues as Partial<
      Record<keyof CheckoutPaymentFieldsSchema, readonly string[]>
    >
  )[fieldName];

  return resolveTypedCustomFieldValue<
    ExtractedCustomFields<CheckoutPaymentFieldsSchema>[TField]
  >(customFieldsRaw, fieldName as string, {
    locale,
    defaultLocale,
    allowedEnumValues,
  });
};

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
