import type { CheckoutState } from "../domain/checkout";
import { checkoutViolationMessage } from "../lib/checkout/violation-message";
import type { CheckoutApiState } from "./checkout-api";

export const toCheckoutApiState = (state: CheckoutState): CheckoutApiState => ({
  ...state,
  violations: state.violations.map((violation) => ({
    ...violation,
    message: checkoutViolationMessage(state.scope.locale, violation),
  })),
});
