// This file is auto-generated. Do not edit manually.
// Run `pnpm cli commerce types generate` to regenerate.

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

export const checkoutPaymentFieldsCustomFieldKinds = {
  checkoutConfirmationReference: "text",
  checkoutTermsInDays: "number",
} as const;

export const orderCustomFieldKinds = {
  checkoutContact: "text",
} as const;
