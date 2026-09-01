// This file is auto-generated. Do not edit manually.
// Run `pnpm cli commerce types generate` to regenerate.

import type { CustomField } from "../types";

export type CheckoutPaymentFieldsSchema = {
  checkoutConfirmationReference: CustomField<"text">;
  checkoutTermsInDays: CustomField<"number">;
};

export type OrderCustomFieldsSchema = {
  checkoutContact: CustomField<"text">;
};
