import { Schema } from "effect";

import {
  CartPublicCheckoutDetails,
  CartPublicSnapshot,
  toCartPublicCheckoutDetails,
  toCartPublicSnapshot,
} from "../cart/public-state";
import { CheckoutViolation } from "../domain/checkout";
import { CheckoutState } from "../domain/checkout-state";
import { checkoutViolationMessage } from "../lib/checkout/violation-message";
import { CommerceLocale } from "../store";

export {
  CartPublicCheckoutDetails as CheckoutPublicDetails,
  CartPublicPreparedPayment as CheckoutPublicPreparedPayment,
  CartPublicSnapshot as CheckoutPublicCart,
} from "../cart/public-state";

export const CheckoutPublicViolation = Schema.Struct({
  ...CheckoutViolation.fields,
  message: Schema.String,
});
export type CheckoutPublicViolation = typeof CheckoutPublicViolation.Type;

export const CheckoutPublicScope = Schema.Union([
  Schema.Struct({
    channel: Schema.Literal("storefrontAnonymous"),
    locale: CommerceLocale,
  }),
  Schema.Struct({
    channel: Schema.Literal("storefrontCustomer"),
    locale: CommerceLocale,
  }),
]);
export type CheckoutPublicScope = typeof CheckoutPublicScope.Type;

export const CheckoutPublicState = Schema.Struct({
  activeStep: CheckoutState.fields.activeStep,
  cart: CartPublicSnapshot,
  details: CartPublicCheckoutDetails,
  scope: CheckoutPublicScope,
  steps: CheckoutState.fields.steps,
  violations: Schema.Array(CheckoutPublicViolation),
});
export type CheckoutPublicState = typeof CheckoutPublicState.Type;

export const toCheckoutPublicState = (
  state: CheckoutState
): CheckoutPublicState => ({
  activeStep: state.activeStep,
  cart: toCartPublicSnapshot(state.cart),
  details: toCartPublicCheckoutDetails(state.details),
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
