import type {
  CheckoutContactSource,
  CheckoutScope,
} from "../../domain/checkout";

const anonymousCheckoutContactSources = [
  "manual",
] as const satisfies readonly CheckoutContactSource[];

const customerCheckoutContactSources = [
  "customerProfile",
  "manual",
] as const satisfies readonly CheckoutContactSource[];

export const allowedContactSourcesForCheckout = (
  scope: CheckoutScope
): readonly CheckoutContactSource[] =>
  scope.channel === "storefrontAnonymous"
    ? anonymousCheckoutContactSources
    : customerCheckoutContactSources;
