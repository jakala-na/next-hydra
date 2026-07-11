import { Effect } from "effect";
import {
  type CartForCheckout,
  LineItemId,
  ProductId,
  Sku,
  VariantId,
} from "../../domain/cart";
import {
  type CheckoutBuyerContext,
  type CheckoutContactSource,
  type CheckoutDetails,
  type CheckoutPolicyViolation,
  type CheckoutScope,
  type CheckoutState,
  type CheckoutStep,
  type CheckoutStepId,
  CheckoutUnavailable,
  type CheckoutViolation,
  type ViolationTarget,
} from "../../domain/checkout";
import type { PolicyViolation } from "../cart/policy/cart-policy.types";

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
    shippingAddress?.streetName.trim() &&
      shippingAddress.postalCode.trim() &&
      shippingAddress.city.trim() &&
      shippingAddress.country.trim()
  );
};

const buildCheckoutSteps = (
  details: CheckoutDetails,
  buyerContext: CheckoutBuyerContext,
  allowedContactSources: readonly CheckoutContactSource[]
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
    status: "incomplete",
  },
  {
    id: "paymentOptions",
    status: "incomplete",
  },
  {
    id: "reviewOrder",
    status: "incomplete",
  },
];

const activeStepFrom = (steps: readonly CheckoutStep[]): CheckoutStepId =>
  steps.find((step) => step.status === "incomplete")?.id ?? "reviewOrder";

const targetsFromCartPolicyViolation = (
  violation: PolicyViolation
): readonly ViolationTarget[] => {
  if (!violation.affectedItems?.length) {
    return [{ type: "cart" }];
  }

  return violation.affectedItems.map((item) => ({
    type: "cartItem",
    ...(item.lineItemId === undefined
      ? {}
      : { lineItemId: LineItemId.make(item.lineItemId) }),
    productId: ProductId.make(item.productId),
    ...(item.variantId === undefined
      ? {}
      : { variantId: VariantId.make(String(item.variantId)) }),
    ...(item.sku === undefined ? {} : { sku: Sku.make(item.sku) }),
  }));
};

const normalizeCartPolicyViolation = (
  violation: PolicyViolation
): CheckoutViolation => ({
  source: "cartPolicy",
  severity: "blocking",
  code: violation.violationType,
  message: violation.message,
  targets: targetsFromCartPolicyViolation(violation),
});

const normalizeCheckoutPolicyViolation = (
  violation: CheckoutPolicyViolation
): CheckoutViolation => ({
  source: "checkoutPolicy",
  severity: "blocking",
  code: violation.code,
  message: violation.message,
  targets: violation.targets,
});

const ensureNonEmptyCart = (cart: CartForCheckout) => {
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
  readonly cart: CartForCheckout;
  readonly details: CheckoutDetails;
  readonly buyerContext: CheckoutBuyerContext;
  readonly allowedContactSources?: readonly CheckoutContactSource[];
  readonly cartPolicyViolations: readonly PolicyViolation[];
  readonly checkoutPolicyViolations: readonly CheckoutPolicyViolation[];
}

export const buildCheckoutState = Effect.fn("buildCheckoutState")(function* ({
  scope,
  cart,
  details,
  buyerContext,
  allowedContactSources = ["manual", "customerProfile"],
  cartPolicyViolations,
  checkoutPolicyViolations,
}: BuildCheckoutStateInput): Effect.fn.Return<
  CheckoutState,
  CheckoutUnavailable
> {
  yield* ensureNonEmptyCart(cart);
  const steps = buildCheckoutSteps(
    details,
    buyerContext,
    allowedContactSources
  );

  return {
    scope,
    cart,
    details,
    steps,
    activeStep: activeStepFrom(steps),
    violations: [
      ...cartPolicyViolations.map(normalizeCartPolicyViolation),
      ...checkoutPolicyViolations.map(normalizeCheckoutPolicyViolation),
    ],
  };
});
