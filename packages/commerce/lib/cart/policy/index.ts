/**
 * Cart Policy Module
 *
 * Provides flexible validation of carts against business rules.
 * Built-in policies are automatically registered on first import - no setup required!
 *
 * @example Basic usage - Zero configuration
 * ```ts
 * import { cartPolicyService } from '@repo/commerce/lib/cart/policy';
 *
 * // No initialization needed - policies are already registered!
 * // Just validate your cart in your server action
 *
 * const result = await cartPolicyService.validateCart({
 *   cart,
 *   locale,
 *   customerId,
 *   additional: {
 *     segments: customerSegments,
 *   },
 * });
 *
 * if (!result.ok) {
 *   // Handle violations
 *   const violations = result.error.details?.violations ?? [];
 * }
 * ```
 *
 * @example Creating a custom policy
 * ```ts
 * import type { CartPolicy, PolicyValidationContext, PolicyViolation } from '@repo/commerce/lib/cart/policy';
 *
 * const myCustomPolicy: CartPolicy = {
 *   name: 'my-custom-policy',
 *   description: 'My custom business rule',
 *
 *   appliesTo: (context: PolicyValidationContext): boolean => {
 *     return true; // or conditional logic
 *   },
 *
 *   validate: async (context: PolicyValidationContext): Promise<PolicyViolation[]> => {
 *     const violations: PolicyViolation[] = [];
 *     // Your validation logic
 *     return violations;
 *   }
 * };
 *
 * cartPolicyService.registerPolicy(myCustomPolicy);
 * ```
 */

// Import init to trigger auto-registration of built-in policies
import "./init";

// biome-ignore lint/performance/noBarrelFile: this is fine
export { CartPolicyService, cartPolicyService } from "./cart-policy.service";
export type {
  CartPolicy,
  LineItemReference,
  PolicyValidationContext,
  PolicyValidationResult,
  PolicyValidatorErrorDetails,
  PolicyViolation,
  PolicyViolationOptions,
} from "./cart-policy.types";
export { policyViolation } from "./cart-policy.types";
export {
  createGuestMaxLimitsPolicy,
  guestMaxLimits,
} from "./policies";
