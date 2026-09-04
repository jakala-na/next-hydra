import { Effect } from "effect";

import type {
  CartPolicyViolation,
  CartSnapshot,
} from "../../domain/cart-snapshot";
import { CheckoutUnavailable } from "../../domain/checkout";
import type {
  CheckoutBuyerContext,
  CheckoutContactSource,
  CheckoutDetails,
  CheckoutPolicyViolation,
  CheckoutScope,
  CheckoutStep,
  CheckoutStepId,
  CheckoutViolation,
} from "../../domain/checkout";
import type { CheckoutState } from "../../domain/checkout-state";
import { shippingAddressesEqual } from "./address-equality";

export const CHECKOUT_STEP_SEQUENCE = [
  "contact",
  "deliveryDetails",
  "shippingOptions",
  "paymentOptions",
  "reviewOrder",
] as const satisfies readonly CheckoutStepId[];

const hasRequiredBuyerContact = (details: CheckoutDetails) => {
  const contact = details.contact?.buyerContact;

  return Boolean(
    contact?.email.trim() && contact.firstName.trim() && contact.lastName.trim()
  );
};

const hasRequiredBuyingContext = (
  details: CheckoutDetails,
  buyerContext: CheckoutBuyerContext
) => {
  if (!buyerContext.requiresBuyingContext) {
    return true;
  }

  return Boolean(details.buyingContext ?? buyerContext.buyingContext);
};

const isContactComplete = (
  details: CheckoutDetails,
  buyerContext: CheckoutBuyerContext,
  allowedContactSources: readonly CheckoutContactSource[]
) =>
  hasRequiredBuyerContact(details) &&
  (details.contact === undefined ||
    allowedContactSources.includes(details.contact.source)) &&
  hasRequiredBuyingContext(details, buyerContext);

const isDeliveryDetailsComplete = (details: CheckoutDetails) => {
  const shippingAddress = details.deliveryDetails?.shippingAddress;

  return Boolean(
    shippingAddress?.addressLine1.trim() &&
    shippingAddress.postalCode.trim() &&
    shippingAddress.city.trim() &&
    shippingAddress.country.trim()
  );
};

const isPaymentOptionsComplete = (
  cart: CartSnapshot,
  details: CheckoutDetails
) => {
  const payment = details.preparedPayment;
  const shippingAddress = details.deliveryDetails?.shippingAddress;

  return (
    payment !== undefined &&
    shippingAddress !== undefined &&
    payment.amount.centAmount === cart.totalPrice.centAmount &&
    payment.amount.currencyCode === cart.totalPrice.currencyCode &&
    shippingAddressesEqual(payment.billingAddress, shippingAddress)
  );
};

const buildCheckoutSteps = (
  cart: CartSnapshot,
  details: CheckoutDetails,
  buyerContext: CheckoutBuyerContext,
  allowedContactSources: readonly CheckoutContactSource[],
  shippingOptionsComplete: boolean
): readonly CheckoutStep[] => [
  {
    id: "contact",
    status: isContactComplete(details, buyerContext, allowedContactSources)
      ? "complete"
      : "incomplete",
  },
  {
    id: "deliveryDetails",
    status: isDeliveryDetailsComplete(details) ? "complete" : "incomplete",
  },
  {
    id: "shippingOptions",
    status: shippingOptionsComplete ? "complete" : "incomplete",
  },
  {
    id: "paymentOptions",
    status: isPaymentOptionsComplete(cart, details) ? "complete" : "incomplete",
  },
  {
    id: "reviewOrder",
    status: "incomplete",
  },
];

const nextStepFrom = (steps: readonly CheckoutStep[]): CheckoutStepId =>
  steps.find((step) => step.status === "incomplete")?.id ?? "reviewOrder";

const normalizeCartPolicyViolation = (
  violation: CartPolicyViolation
): CheckoutViolation => {
  if (violation.parameters === undefined) {
    return {
      code: violation.code,
      severity: "blocking",
      source: "cartPolicy",
      targets: violation.targets,
    };
  }
  return {
    code: violation.code,
    parameters: violation.parameters,
    severity: "blocking",
    source: "cartPolicy",
    targets: violation.targets,
  };
};

const normalizeCheckoutPolicyViolation = (
  violation: CheckoutPolicyViolation
): CheckoutViolation => {
  if (violation.parameters === undefined) {
    return {
      code: violation.code,
      severity: "blocking",
      source: "checkoutPolicy",
      targets: violation.targets,
    };
  }
  return {
    code: violation.code,
    parameters: violation.parameters,
    severity: "blocking",
    source: "checkoutPolicy",
    targets: violation.targets,
  };
};

const ensureNonEmptyCart = (cart: CartSnapshot) => {
  if (cart.totalLineItemQuantity <= 0 || cart.lineItems.length === 0) {
    return Effect.fail(
      new CheckoutUnavailable({
        message: "Checkout requires an existing non-empty Cart",
        reason: "emptyCart",
      })
    );
  }

  return Effect.succeed(cart);
};

export interface BuildCheckoutStateInput {
  readonly scope: CheckoutScope;
  readonly cart: CartSnapshot;
  readonly details: CheckoutDetails;
  readonly buyerContext: CheckoutBuyerContext;
  readonly allowedContactSources?: readonly CheckoutContactSource[];
  readonly cartPolicyViolations: readonly CartPolicyViolation[];
  readonly checkoutPolicyViolations: readonly CheckoutPolicyViolation[];
  readonly shippingOptionsComplete?: boolean;
}

export const buildCheckoutState = Effect.fn("buildCheckoutState")(function* ({
  scope,
  cart,
  details,
  buyerContext,
  allowedContactSources = ["manual", "customerProfile"],
  cartPolicyViolations,
  checkoutPolicyViolations,
  shippingOptionsComplete = false,
}: BuildCheckoutStateInput): Effect.fn.Return<
  CheckoutState,
  CheckoutUnavailable
> {
  yield* ensureNonEmptyCart(cart);
  const steps = buildCheckoutSteps(
    cart,
    details,
    buyerContext,
    allowedContactSources,
    shippingOptionsComplete
  );

  return {
    cart,
    details,
    nextStep: nextStepFrom(steps),
    scope,
    steps,
    violations: [
      ...cartPolicyViolations.map(normalizeCartPolicyViolation),
      ...checkoutPolicyViolations.map(normalizeCheckoutPolicyViolation),
    ],
  };
});
