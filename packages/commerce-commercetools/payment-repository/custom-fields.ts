export const PAYMENT_CUSTOM_TYPE_KEY = "checkoutPaymentFields";

export const PAYMENT_ATTEMPT_REFERENCE_FIELD =
  "checkoutPlacementAttemptReference";
export const PAYMENT_TERMS_IN_DAYS_FIELD = "checkoutTermsInDays";
export const PAYMENT_CARD_BRAND_FIELD = "checkoutCardBrand";
export const PAYMENT_CARD_LAST_FOUR_FIELD = "checkoutCardLastFour";

export const CHECKOUT_PAYMENT_CUSTOM_FIELD_NAMES = new Set<string>([
  PAYMENT_ATTEMPT_REFERENCE_FIELD,
  PAYMENT_CARD_BRAND_FIELD,
  PAYMENT_CARD_LAST_FOUR_FIELD,
  PAYMENT_TERMS_IN_DAYS_FIELD,
]);
