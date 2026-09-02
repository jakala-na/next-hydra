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

export const orderCustomFieldKinds = {
  checkoutContact: "text",
} as const;

export const paymentCustomFieldKinds = {
  checkoutPlacementAttemptReference: "text",
  checkoutTermsInDays: "number",
  checkoutCardBrand: "text",
  checkoutCardLastFour: "text",
} as const;
