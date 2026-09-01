export const PAYMENT_CUSTOM_TYPE_KEY = "checkoutPaymentFields";

export const PAYMENT_CONFIRMATION_REFERENCE_FIELD =
  "checkoutConfirmationReference";
export const PAYMENT_TERMS_IN_DAYS_FIELD = "checkoutTermsInDays";

export const CHECKOUT_PAYMENT_CUSTOM_FIELD_NAMES = new Set<string>([
  PAYMENT_CONFIRMATION_REFERENCE_FIELD,
  PAYMENT_TERMS_IN_DAYS_FIELD,
]);
