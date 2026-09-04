import { Schema } from "effect";

import { CartSnapshot } from "./cart-snapshot";
import {
  CheckoutDetails,
  CheckoutScope,
  CheckoutStep,
  CheckoutStepId,
  CheckoutViolation,
} from "./checkout";

export const CheckoutState = Schema.Struct({
  cart: CartSnapshot,
  details: CheckoutDetails,
  nextStep: CheckoutStepId,
  scope: CheckoutScope,
  steps: Schema.Array(CheckoutStep),
  violations: Schema.Array(CheckoutViolation),
});
export type CheckoutState = typeof CheckoutState.Type;
