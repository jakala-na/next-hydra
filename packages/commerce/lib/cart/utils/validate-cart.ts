import { cartPolicyService } from '../policy';
import type {
  PolicyValidationContext,
  PolicyViolation,
} from '../policy/cart-policy.types';

/**
 * Validates a cart against all registered policies
 * Returns violations (empty array if valid)
 *
 * This is a non-blocking validation - always returns violations,
 * never throws errors
 */
export const validateCartPolicies = async (
  context: PolicyValidationContext
): Promise<PolicyViolation[]> => {
  const result = await cartPolicyService.checkPolicies(context);

  return result.violations;
};
