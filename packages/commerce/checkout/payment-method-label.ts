import type { PaymentMethodSummary } from "@repo/payments";

const CARD_BRAND_NAMES = new Map<string, string>([
  ["amex", "American Express"],
  ["cartes_bancaires", "Cartes Bancaires"],
  ["diners", "Diners Club"],
  ["discover", "Discover"],
  ["jcb", "JCB"],
  ["mastercard", "Mastercard"],
  ["unionpay", "UnionPay"],
  ["visa", "Visa"],
]);

export const paymentMethodLabel = (paymentMethod: PaymentMethodSummary) =>
  paymentMethod.method === "netTerms"
    ? `Net ${paymentMethod.termsInDays}`
    : `${CARD_BRAND_NAMES.get(paymentMethod.cardBrand) ?? paymentMethod.cardBrand} ending in ${paymentMethod.lastFour}`;
