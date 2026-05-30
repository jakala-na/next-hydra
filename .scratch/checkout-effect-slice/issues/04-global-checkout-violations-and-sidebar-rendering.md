# Global Checkout Violations and sidebar rendering

Status: ready-for-agent
Type: AFK

## Parent

`.scratch/checkout-effect-slice/PRD.md`

## What to build

Normalize Cart Policy Violations and Checkout Policy Violations into one global Checkout Violations list in Checkout State. The checkout experience should render those violations without requiring every violation to belong to a step. Cart-item and whole-cart targets should be visible in the sidebar, while step targets remain available for step-specific rendering.

This slice proves the core checkout state model after Contact and Delivery Details exist, before adding more source variants. All first-slice Checkout Violations are blocking. They should explain why checkout cannot progress while preserving whether each violation came from Cart Policy or Checkout Policy.

## Acceptance criteria

- [ ] Checkout State includes one global Checkout Violations list.
- [ ] Cart Policy Violations are normalized into Checkout Violations.
- [ ] Checkout Policy Violations are normalized into Checkout Violations.
- [ ] Each Checkout Violation preserves its source as Cart Policy or Checkout Policy.
- [ ] Each Checkout Violation can target a Checkout Step, a cart item, or the whole Cart.
- [ ] Violations do not have to belong to a Checkout Step.
- [ ] All first-slice Checkout Violations are blocking.
- [ ] Blocking violations do not create a third Checkout Step status.
- [ ] Checkout Policy can evaluate checkout facts saved by Contact and Delivery Details.
- [ ] Cart Policy remains a separate capability even when Checkout displays its violations.
- [ ] The cart sidebar renders whole-cart and cart-item violations from the global list.
- [ ] The active step can render step-targeted violations from the same global list when present.
- [ ] Tests cover normalization, source preservation, whole-cart targets, cart-item targets, step targets, non-step-bound violations, and blocking behavior.
- [ ] Relevant typecheck and test commands pass.

## Blocked by

- `.scratch/checkout-effect-slice/issues/01-checkout-effect-kernel-and-current-state-tracer.md`
- `.scratch/checkout-effect-slice/issues/03-manual-delivery-details-save.md`

