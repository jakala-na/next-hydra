# Cart Policy Service

A flexible validation framework for enforcing business rules on shopping carts.

## Overview

The Cart Policy Service allows you to define and enforce business rules (policies) on carts. It's designed to be extensible and supports various contexts beyond just the cart itself (e.g., customer contracts, segments, promotions).

## Features

- **Flexible Context**: Validate carts with additional context (contracts, customer segments, etc.)
- **Composable Policies**: Register multiple policies that run independently
- **Type-Safe**: Full TypeScript support with detailed error types
- **Async Support**: Policies can perform async operations (DB queries, API calls)
- **Conditional Application**: Policies can selectively apply based on context
- **Non-blocking**: Returns violations as data, not errors

## Quick Start

### Integration with cart

All cart actions (`getCart`, `addToCart`, `changeQuantity`, `removeItem`) automatically validate and return policy issues:

```typescript
const result = await getCart();
// result.data = { cart: Cart, issues: PolicyViolation[] }
```

The flyout cart component displays violations automatically when you pass the `issues` prop.

### Using in Components

```typescript
import { FlyoutCart } from '@repo/design-system/components/commerce-ui/flyout-cart';
import { getCart } from '@repo/commerce/lib/cart/actions/get-cart';

export async function CartFlyout() {
  const result = await getCart();
  
  if (!result.ok) {
    return <div>Error loading cart</div>;
  }

  // Cart actions return { cart, issues }
  const { cart, issues } = result.data;

  return (
    <FlyoutCart
      items={items}
      issues={issues}  // Violations displayed automatically!
      flyoutTitle="Your Cart"
      emptyMessage="Cart is empty"
      // ... other props
    />
  );
}
```

The flyout will:
- Show a red-bordered "Cart Issues" alert at the top
- Highlight violating line items with red borders
- Display clear error messages for each violation

## Creating Custom Policies

### Step 1: Implement the CartPolicy Interface

```typescript
import type { 
  CartPolicy, 
  PolicyValidationContext, 
  PolicyViolation 
} from '@repo/commerce/lib/cart/policy';
import { policyViolation } from '@repo/commerce/lib/cart/policy';

export class MaxQuantityPolicy implements CartPolicy {
  readonly name = 'max-quantity-per-product';
  readonly description = 'Limits quantity per product variant';

  constructor(private maxQuantity: number = 100) {}

  appliesTo(context: PolicyValidationContext): boolean {
    // Apply to all carts
    return true;
  }

  async validate(context: PolicyValidationContext): Promise<PolicyViolation[]> {
    const violations: PolicyViolation[] = [];

    for (const lineItem of context.cart.lineItems) {
      if (lineItem.quantity > this.maxQuantity) {
        violations.push(
          policyViolation(
            this.name,
            'MAX_QUANTITY_EXCEEDED',
            `Product ${lineItem.name ?? lineItem.productId} exceeds maximum quantity of ${this.maxQuantity}`,
            [{
              lineItemId: lineItem.id,
              productId: lineItem.productId,
              variantId: lineItem.variant?.id,
            }],
            {
              currentQuantity: lineItem.quantity,
              maxQuantity: this.maxQuantity,
            }
          )
        );
      }
    }

    return violations;
  }
}
```

### Step 2: Register Your Policy

```typescript
import { cartPolicyService } from '@repo/commerce/lib/cart/policy';
import { MaxQuantityPolicy } from './policies/max-quantity.policy';

cartPolicyService.registerPolicy(new MaxQuantityPolicy(50));
```

## Integration with Server Actions

Storefront Server Actions call the request-provided `CurrentCart` Effect
Service. `CurrentCart` invokes `CartPolicies` for every returned Cart state, so
actions receive policy violations as successful `CurrentCartState.violations`
data and do not evaluate policies separately.

## Advanced Usage

### Conditional Policy Application

```typescript
class PremiumCustomerPolicy implements CartPolicy {
  readonly name = 'premium-discount';
  readonly description = 'Validates premium customer discounts';

  appliesTo(context: PolicyValidationContext): boolean {
    // Only apply to premium customers
    const segments = context.additional?.segments ?? [];
    return segments.includes('premium');
  }

  async validate(context: PolicyValidationContext): Promise<PolicyViolation[]> {
    // Policy logic here
    return [];
  }
}
```

### Async Validation with External Data

```typescript
class InventoryAvailabilityPolicy implements CartPolicy {
  readonly name = 'inventory-availability';
  readonly description = 'Ensures products are in stock';

  appliesTo(): boolean {
    return true;
  }

  async validate(context: PolicyValidationContext): Promise<PolicyViolation[]> {
    const violations: PolicyViolation[] = [];

    // Fetch inventory levels from external service
    for (const lineItem of context.cart.lineItems) {
      const inventory = await this.checkInventory(
        lineItem.variant?.sku ?? ''
      );

      if (inventory < lineItem.quantity) {
        violations.push(
          policyViolation(
            this.name,
            'INSUFFICIENT_INVENTORY',
            `Insufficient stock for ${lineItem.name}`,
            [{ lineItemId: lineItem.id, productId: lineItem.productId }],
            { available: inventory, requested: lineItem.quantity }
          )
        );
      }
    }

    return violations;
  }

  private async checkInventory(sku: string): Promise<number> {
    // Call inventory service
    return 0;
  }
}
```

## API Reference

### cartPolicyService

Main service for policy management and validation.

**Methods**:
- `registerPolicy(policy: CartPolicy): void` - Register a single policy
- `registerPolicies(policies: CartPolicy[]): void` - Register multiple policies
- `unregisterPolicy(policyName: string): void` - Remove a policy
- `getPolicies(): readonly CartPolicy[]` - Get all registered policies
- `validateCart(context): Promise<ActionResult<...>>` - Validate cart (returns error if violations)
- `checkPolicies(context): Promise<PolicyValidationResult>` - Check policies (always returns result)

### Types

- `PolicyValidationContext` - Context passed to policies (cart + additional data)
- `PolicyViolation` - Violation details returned by policies
- `CartPolicy` - Interface to implement for custom policies
- `PolicyValidationResult` - Result of validation (valid + violations array)

## Best Practices

1. **Keep Policies Focused**: Each policy should validate one business rule
2. **Use Descriptive Names**: Policy names should clearly indicate what they validate
3. **Provide Context**: Include helpful metadata in violations for debugging
4. **Handle Errors**: Wrap policy logic in try-catch to prevent crashes
5. **Test Independently**: Each policy should be testable in isolation
6. **Document Requirements**: Clearly document what context each policy needs

## Testing

```typescript
import { describe, it, expect } from 'vitest';
import { ContractFulfillmentPolicy } from './policies/contract-fulfillment.policy';

describe('ContractFulfillmentPolicy', () => {
  const policy = new ContractFulfillmentPolicy();

  it('should pass when contract is fulfilled', async () => {
    const context = {
      cart: {
        id: 'cart-1',
        lineItems: [
          { productId: 'p1', variantId: 1, quantity: 10 }
        ],
        // ... other cart fields
      },
      locale: 'en-US',
      additional: {
        contracts: [{
          id: 'c1',
          customerId: 'cust-1',
          requiredProducts: [
            { productId: 'p1', variantId: 1, requiredQuantity: 10 }
          ],
          status: 'active'
        }]
      }
    };

    const violations = await policy.validate(context);
    expect(violations).toHaveLength(0);
  });
});
```

