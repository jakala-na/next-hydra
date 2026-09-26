import { Schema } from "effect";

import type { CheckoutStep, CheckoutStepId } from "../domain/checkout";

export const CheckoutEditStepId = Schema.Literals([
  "contact",
  "deliveryDetails",
  "shippingOptions",
  "paymentOptions",
]);
export type CheckoutEditStepId = typeof CheckoutEditStepId.Type;

interface CheckoutProgress {
  readonly nextStep: CheckoutStepId;
  readonly steps: readonly CheckoutStep[];
}

export const checkoutRenderedStepFor = (
  checkout: Pick<CheckoutProgress, "nextStep">,
  editedStep: CheckoutEditStepId | undefined
): CheckoutStepId => editedStep ?? checkout.nextStep;

export const checkoutEditedStepFor = (
  checkout: CheckoutProgress,
  requestedEditStep: CheckoutEditStepId | undefined
): CheckoutEditStepId | undefined => {
  if (requestedEditStep === undefined) {
    return undefined;
  }

  const nextStepIndex = checkout.steps.findIndex(
    (step) => step.id === checkout.nextStep
  );
  const requestedIndex = checkout.steps.findIndex(
    (step) => step.id === requestedEditStep && step.status === "complete"
  );

  return requestedIndex !== -1 && requestedIndex < nextStepIndex
    ? requestedEditStep
    : undefined;
};
