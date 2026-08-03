import type { CheckoutStepId, CheckoutViolation } from "../domain/checkout";
import {
  isVisibleForCheckoutStep,
  isVisibleInCartSidebar,
} from "../lib/checkout/violation-visibility";

interface CheckoutViolationMessages {
  readonly attention: string;
  readonly cartViolations: string;
  readonly violation: (violation: CheckoutViolation) => string;
}

export function ActiveStepViolations({
  activeStep,
  messages,
  violations,
}: {
  readonly activeStep: CheckoutStepId;
  readonly messages: CheckoutViolationMessages;
  readonly violations: readonly CheckoutViolation[];
}) {
  const visibleViolations = violations.filter((violation) =>
    isVisibleForCheckoutStep(violation, activeStep)
  );

  if (visibleViolations.length === 0) {
    return null;
  }

  return (
    <div className="mb-6 rounded-md border border-destructive p-4">
      <h2 className="font-medium text-destructive text-sm">
        {messages.attention}
      </h2>
      <ul className="mt-2 grid gap-2">
        {visibleViolations.map((violation, index) => (
          <li
            className="text-destructive text-sm"
            key={`${violation.source}:${violation.code}:${index}`}
          >
            {messages.violation(violation)}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CartSidebarViolations({
  messages,
  violations,
}: {
  readonly messages: CheckoutViolationMessages;
  readonly violations: readonly CheckoutViolation[];
}) {
  const visibleViolations = violations.filter(isVisibleInCartSidebar);

  if (visibleViolations.length === 0) {
    return null;
  }

  return (
    <div className="mt-5 border-destructive border-t pt-4">
      <h3 className="font-medium text-destructive text-sm">
        {messages.cartViolations}
      </h3>
      <ul className="mt-3 grid gap-2">
        {visibleViolations.map((violation, index) => (
          <li
            className="text-destructive text-sm"
            key={`${violation.source}:${violation.code}:${index}`}
          >
            {messages.violation(violation)}
          </li>
        ))}
      </ul>
    </div>
  );
}
