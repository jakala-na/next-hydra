import type { CheckoutStepId, CheckoutViolation } from "../../domain/checkout";

export const isVisibleInCartSidebar = (violation: CheckoutViolation) =>
  violation.targets.length === 0 ||
  violation.targets.some(
    (target) => target.type === "cart" || target.type === "cartItem"
  );

export const isVisibleForCheckoutStep = (
  violation: CheckoutViolation,
  step: CheckoutStepId
) =>
  violation.targets.some(
    (target) => target.type === "checkoutStep" && target.step === step
  );
