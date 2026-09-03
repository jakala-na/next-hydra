// This file is auto-generated. Do not edit manually.
// Run `pnpm cli commerce types generate` to regenerate.

import { Schema } from "effect";

import * as CustomFields from "../definition";

export const OrderCustomFields = CustomFields.define({
  typeKey: "orderCustomFields",
  fields: {
    "checkoutContact": Schema.optionalKey(Schema.String),
    "checkoutDeliveryDetails": Schema.optionalKey(Schema.String),
  },
});
export type OrderCustomFields = typeof OrderCustomFields.schema.Type;

export const PaymentCustomFields = CustomFields.define({
  typeKey: "paymentCustomFields",
  fields: {
    "checkoutPlacementAttemptReference": Schema.optionalKey(Schema.String),
    "checkoutTermsInDays": Schema.optionalKey(Schema.Finite),
    "checkoutCardBrand": Schema.optionalKey(Schema.String),
    "checkoutCardLastFour": Schema.optionalKey(Schema.String),
  },
});
export type PaymentCustomFields = typeof PaymentCustomFields.schema.Type;
