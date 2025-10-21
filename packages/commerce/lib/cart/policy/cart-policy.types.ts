import type { Cart } from "@repo/commerce/lib/types";
import type { Locale } from "@repo/i18n/types";

/**
 * Context for policy validation - includes cart and extensible additional context
 */
export type PolicyValidationContext = {
  cart: Cart;
  locale: Locale;
  customerId?: string;
  /** Extensible context for B2B, customer segments, etc. */
  additional?: {
    /** Customer segments for special rules */
    segments?: string[];
    /** Any other custom context */
    [key: string]: unknown;
  };
};

/**
 * Violation details for policy failures
 */
export type PolicyViolation = {
  policyName: string;
  violationType: string;
  message: string;
  affectedItems?: LineItemReference[];
  metadata?: Record<string, unknown>;
};

export type LineItemReference = {
  lineItemId?: string;
  productId: string;
  variantId?: number;
  sku?: string;
};

/**
 * Result of policy validation
 */
export type PolicyValidationResult = {
  valid: boolean;
  violations: PolicyViolation[];
};

/**
 * Policy interface - implement this for each business rule
 */
export type CartPolicy = {
  /** Unique identifier for this policy */
  readonly name: string;

  /** Policy description for logging/debugging */
  readonly description: string;

  /**
   * Validate the cart against this policy
   * @returns Array of violations (empty if valid)
   */
  validate: (context: PolicyValidationContext) => Promise<PolicyViolation[]>;

  /**
   * Check if this policy applies to the current context
   * Allows conditional policy application
   */
  appliesTo: (context: PolicyValidationContext) => boolean;
};

/**
 * Policy validator error details
 */
export type PolicyValidatorErrorDetails = {
  violations: PolicyViolation[];
  context: {
    cartId: string;
    customerId?: string;
  };
};

/**
 * Options for creating a policy violation
 */
export type PolicyViolationOptions = {
  policyName: string;
  violationType: string;
  message: string;
  affectedItems?: LineItemReference[];
  metadata?: Record<string, unknown>;
};

/**
 * Helper to create a policy violation
 */
export const policyViolation = (
  options: PolicyViolationOptions
): PolicyViolation => ({
  policyName: options.policyName,
  violationType: options.violationType,
  message: options.message,
  affectedItems: options.affectedItems,
  metadata: options.metadata,
});
