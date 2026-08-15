import type { CheckoutState } from "../domain/checkout";
import { checkoutViolationMessage } from "../lib/checkout/violation-message";
import type { CheckoutApiState } from "./checkout-api";

const toCheckoutApiDetails = (details: CheckoutState["details"]) => ({
  ...(details.contact === undefined ? {} : { contact: details.contact }),
  ...(details.deliveryDetails === undefined
    ? {}
    : { deliveryDetails: details.deliveryDetails }),
});

export const toCheckoutApiState = (state: CheckoutState): CheckoutApiState => ({
  activeStep: state.activeStep,
  cart: {
    checkoutDetails: toCheckoutApiDetails(state.cart.checkoutDetails),
    id: state.cart.id,
    lineItems: state.cart.lineItems,
    status: state.cart.status,
    storeKey: state.cart.storeKey,
    totalLineItemQuantity: state.cart.totalLineItemQuantity,
    totalPrice: state.cart.totalPrice,
  },
  details: toCheckoutApiDetails(state.details),
  scope: {
    channel: state.scope.channel,
    locale: state.scope.locale,
  },
  steps: state.steps,
  violations: state.violations.map((violation) => ({
    ...violation,
    message: checkoutViolationMessage(state.scope.locale, violation),
  })),
});
