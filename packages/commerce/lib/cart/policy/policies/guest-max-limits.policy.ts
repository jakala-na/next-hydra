import type {
  CartPolicy,
  PolicyValidationContext,
  PolicyViolation,
} from '../cart-policy.types';
import { policyViolation } from '../cart-policy.types';

const MAX_GUEST_TOTAL_ITEMS = 50 as const;
const GUEST_MAX_LIMITS_POLICY_NAME = 'guest-max-limits' as const;

const isGuestContext = (context: PolicyValidationContext): boolean => {
  if (context.customerId) {
    return false;
  }

  if (context.cart.customerId) {
    return false;
  }

  return true;
};

type GuestLimitViolationParams = {
  maxQuantity: number;
  totalQuantity: number;
  excessQuantity: number;
  lineItem: PolicyValidationContext['cart']['lineItems'][number];
};

const buildGuestQuantityViolation = ({
  maxQuantity,
  totalQuantity,
  excessQuantity,
  lineItem,
}: GuestLimitViolationParams): PolicyViolation => {
  const productLabel = lineItem.name ?? lineItem.productId;
  const unitLabel = excessQuantity === 1 ? 'unit' : 'units';

  return policyViolation({
    policyName: GUEST_MAX_LIMITS_POLICY_NAME,
    violationType: 'MAX_GUEST_TOTAL_ITEMS_EXCEEDED',
    message: `Guest carts are limited to ${maxQuantity} total items. Remove at least ${excessQuantity} ${unitLabel} from ${productLabel}.`,
    affectedItems: [
      {
        lineItemId: lineItem.id,
        productId: lineItem.productId,
        variantId: lineItem.variant?.id,
        sku: lineItem.variant?.sku,
      },
    ],
    metadata: {
      currentQuantity: lineItem.quantity,
      totalQuantity,
      excessQuantity,
      maxQuantity,
    },
  });
};

export const createGuestMaxLimitsPolicy = (
  maxQuantity: number = MAX_GUEST_TOTAL_ITEMS
): CartPolicy => ({
  name: GUEST_MAX_LIMITS_POLICY_NAME,
  description: 'Enforces guest cart total item limits for anonymous shoppers',

  appliesTo: (context: PolicyValidationContext): boolean => {
    return isGuestContext(context);
  },

  // biome-ignore lint/suspicious/useAwait: policy checker expects a promise
  validate: async (
    context: PolicyValidationContext
  ): Promise<PolicyViolation[]> => {
    const totalQuantity = context.cart.totalLineItemQuantity;

    if (totalQuantity <= maxQuantity) {
      return [];
    }

    const violations: PolicyViolation[] = [];
    let runningTotal = 0;

    for (const lineItem of context.cart.lineItems) {
      const previousTotal = runningTotal;
      runningTotal += lineItem.quantity;

      if (runningTotal <= maxQuantity) {
        continue;
      }

      const previousOverage = Math.max(previousTotal - maxQuantity, 0);
      const currentOverage = runningTotal - maxQuantity;
      const excessQuantity = currentOverage - previousOverage;

      if (excessQuantity <= 0) {
        continue;
      }

      violations.push(
        buildGuestQuantityViolation({
          maxQuantity,
          totalQuantity,
          excessQuantity,
          lineItem,
        })
      );
    }

    return violations;
  },
});

export const guestMaxLimits = createGuestMaxLimitsPolicy();
