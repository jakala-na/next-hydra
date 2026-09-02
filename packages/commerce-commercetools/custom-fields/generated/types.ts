// This file is auto-generated. Do not edit manually.
// Run `pnpm cli commerce types generate` to regenerate.

import type { CustomField } from "../types";

export type OrderCustomFieldsSchema = {
  checkoutContact: CustomField<"text">;
};

export type PaymentCustomFieldsSchema = {
  checkoutPlacementAttemptReference: CustomField<"text">;
  checkoutTermsInDays: CustomField<"number">;
  checkoutCardBrand: CustomField<"text">;
  checkoutCardLastFour: CustomField<"text">;
};
