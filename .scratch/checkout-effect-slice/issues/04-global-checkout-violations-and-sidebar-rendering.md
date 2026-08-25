# Global Checkout Violations and sidebar rendering

Status: complete
Type: AFK

## Parent

`.scratch/checkout-effect-slice/PRD.md`

## What to build

Normalize Cart Policy Violations and Checkout Policy Violations into one global Checkout Violations list in Checkout State. The checkout experience should render those violations without requiring every violation to belong to a step. Cart-item and whole-cart targets should be visible in the sidebar, while step targets remain available for step-specific rendering.

This slice proves the core checkout state model after Contact and Delivery Details exist, before adding more source variants. All first-slice Checkout Violations are blocking. They should explain why checkout cannot progress while preserving whether each violation came from Cart Policy or Checkout Policy.

## Acceptance criteria

- [x] Checkout State includes one global Checkout Violations list.
- [x] Cart Policy Violations are normalized into Checkout Violations.
- [x] Checkout Policy Violations are normalized into Checkout Violations.
- [x] Each Checkout Violation preserves its source as Cart Policy or Checkout Policy.
- [x] Each Checkout Violation can target a Checkout Step, a cart item, or the whole Cart.
- [x] Violations can be step-targeted, cart-targeted, or global.
- [x] All first-slice Checkout Violations are blocking.
- [x] Blocking violations are represented separately from binary Checkout Step status.
- [x] Checkout Policy can evaluate checkout details saved by Contact and Delivery Details.
- [x] Cart Policy remains a separate capability even when Checkout displays its violations.
- [x] The cart sidebar renders whole-cart and cart-item violations from the global list.
- [x] The active step can render step-targeted violations from the same global list when present.
- [x] Tests cover normalization, source preservation, whole-cart targets, cart-item targets, step targets, non-step-bound violations, and blocking behavior.
- [x] Relevant typecheck and test commands pass.

## Implementation notes

- `CheckoutPolicies` evaluates configured Checkout Policies with the current Cart, saved Checkout Details, and buyer context before `buildCheckoutState` normalizes their violations.
- The live Checkout Policy layer treats Réunion (`RE`) as unavailable for shipping and targets the resulting blocking violation to Shipping Options.
- Checkout violations expose stable codes and schema-backed parameters; the localized presentation boundary renders all public messages from `web.checkout` translation strings.
- Internal Checkout Policy Violations retain diagnostic messages for logs and context; normalization into public Checkout State deliberately drops those messages.
- The public Checkout HTTP schema decorates normalized violations with localized fallback messages while preserving their codes and parameters; internal diagnostic messages are never exposed.
- Checkout HTTP errors are a separate boundary contract and expose both stable codes and localized fallback messages.
- Cart Policy evaluation remains a separate path and preserves `cartPolicy` as the normalized violation source.
- The Cart sidebar renders untargeted, whole-Cart, and cart-item violations; the Active Checkout Step renders only violations targeted to that step.
- Component render tests cover localized violation output and the sidebar-versus-active-step targeting boundary.

## Blocked by

- `.scratch/checkout-effect-slice/issues/01-checkout-effect-kernel-and-current-state-tracer.md`
- `.scratch/checkout-effect-slice/issues/03-manual-delivery-details-save.md`
