import { toCheckoutPublicState } from "../checkout/public-state";
import type {
  CheckoutPaymentOptionsSnapshot,
  CheckoutSessionSnapshot,
} from "../lib/checkout/checkout-session";
import type {
  CheckoutApiPaymentOptionsSnapshot,
  CheckoutApiSnapshot,
} from "./checkout-api";

export const toCheckoutApiState = toCheckoutPublicState;

export const toCheckoutApiSnapshot = (
  snapshot: CheckoutSessionSnapshot
): CheckoutApiSnapshot => ({
  ...toCheckoutApiState(snapshot.state),
  deliveryPlanQuote: snapshot.deliveryPlanQuote,
});

export const toCheckoutApiPaymentOptionsSnapshot = (
  snapshot: CheckoutPaymentOptionsSnapshot
): CheckoutApiPaymentOptionsSnapshot => ({
  paymentOptions: snapshot.paymentOptions,
  state: toCheckoutApiState(snapshot.state),
});
