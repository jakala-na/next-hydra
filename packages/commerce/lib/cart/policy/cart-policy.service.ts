import type { ActionResult } from '../../utils/errors';
import { domainError, Err, Ok } from '../../utils/errors';
import type {
  CartPolicy,
  PolicyValidationContext,
  PolicyValidationResult,
  PolicyValidatorErrorDetails,
} from './cart-policy.types';

/**
 * Cart Policy Service
 * Validates carts against registered business rules/policies
 */
export class CartPolicyService {
  private policies: CartPolicy[] = [];

  /**
   * Register a policy for validation
   */
  registerPolicy(policy: CartPolicy): void {
    this.policies.push(policy);
  }

  /**
   * Register multiple policies at once
   */
  registerPolicies(policies: CartPolicy[]): void {
    this.policies.push(...policies);
  }

  /**
   * Remove a policy by name
   */
  unregisterPolicy(policyName: string): void {
    this.policies = this.policies.filter((p) => p.name !== policyName);
  }

  /**
   * Get all registered policies
   */
  getPolicies(): readonly CartPolicy[] {
    return this.policies;
  }

  /**
   * Validate cart against all applicable policies
   * Returns Ok(result) if all policies pass or ActionResult with violations
   */
  async validateCart(
    context: PolicyValidationContext
  ): Promise<
    ActionResult<PolicyValidationResult, PolicyValidatorErrorDetails>
  > {
    const applicablePolicies = this.policies.filter((policy) =>
      policy.appliesTo(context)
    );

    // Run all applicable policies in parallel
    const violationResults = await Promise.all(
      applicablePolicies.map(async (policy) => {
        try {
          return await policy.validate(context);
        } catch (error) {
          // If a policy throws, treat it as a violation
          return [
            {
              policyName: policy.name,
              violationType: 'POLICY_ERROR',
              message: `Policy validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
              metadata: { error },
            },
          ];
        }
      })
    );

    // Flatten all violations
    const allViolations = violationResults.flat();

    const result: PolicyValidationResult = {
      valid: allViolations.length === 0,
      violations: allViolations,
    };

    // If there are violations, return as error
    if (!result.valid) {
      return Err(
        domainError<PolicyValidatorErrorDetails>(
          'BAD_INPUT',
          'Cart validation failed - policy violations detected',
          {
            violations: allViolations,
            context: {
              cartId: context.cart.id,
              customerId: context.customerId,
            },
          }
        )
      );
    }

    return Ok(result);
  }

  /**
   * Validate cart but only return the result (not wrapped in ActionResult)
   * Useful for non-blocking validation or pre-flight checks
   */
  async checkPolicies(
    context: PolicyValidationContext
  ): Promise<PolicyValidationResult> {
    const result = await this.validateCart(context);
    if (result.ok) {
      return result.data;
    }
    return {
      valid: false,
      violations: result.error.details?.violations ?? [],
    };
  }
}

// Export singleton instance
export const cartPolicyService = new CartPolicyService();
