export const cardPaymentKeyForCheckout = (checkoutReference: string) =>
  `checkout-card-${checkoutReference}`;

export const netTermsPaymentKeyForCheckout = (checkoutReference: string) =>
  `checkout-net-terms-${checkoutReference}`;
