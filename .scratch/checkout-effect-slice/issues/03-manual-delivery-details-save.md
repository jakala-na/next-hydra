# Manual Delivery Details save

Status: ready-for-agent
Type: AFK

## Parent

`.scratch/checkout-effect-slice/PRD.md`

## What to build

Add the first Delivery Details mutation path through `CheckoutSession` for Manual Delivery Details Source. A buyer should be able to submit a manually entered Shipping Address, save it to the Cart through the Commercetools `CheckoutSession` layer, rerun Checkout State, and see Delivery Details become complete when the Shipping Address is structurally valid.

The mutation should be available through `CheckoutSession.saveDeliveryDetails`, then exposed through thin adapters. Next.js server actions and HTTP handlers should call the same `CheckoutSession` method through the checkout runtime layer. The mutation should save structurally valid addresses even when policy evaluation later produces a Checkout Violation. It should be replacement-style and idempotent, with structured failures for invalid input, provider failure, and version conflict.

## Acceptance criteria

- [ ] `saveDeliveryDetails` supports Manual Delivery Details Source.
- [ ] Manual Delivery Details save is implemented as `CheckoutSession.saveDeliveryDetails` outside the HTTP boundary.
- [ ] Server action or in-process application adapters can call `CheckoutSession.saveDeliveryDetails` directly.
- [ ] The HTTP API exposes current-checkout Delivery Details save behavior through a thin adapter.
- [ ] HTTP Delivery Details save obtains Checkout Scope from resolved request context, not from trusted customer or cart identity headers.
- [ ] Delivery Details save input includes the current cart reference needed for optimistic concurrency.
- [ ] Delivery Details save resolves the current Cart from Checkout Scope and does not trust a submitted cart id as the authorization boundary.
- [ ] Manual Delivery Details input accepts a Shipping Address.
- [ ] Delivery Details completion depends on the resolved Shipping Address.
- [ ] Structurally valid Shipping Address details are saved to the Cart.
- [ ] A structurally valid Shipping Address can be saved even if it later produces a Checkout Violation.
- [ ] Repeated saves with the same Manual Shipping Address are idempotent replacement-style mutations.
- [ ] Invalid Shipping Address input fails with structured schema/decode errors.
- [ ] Provider failures and version conflicts map to structured Checkout Mutation Failures.
- [ ] The checkout UI can submit Manual Delivery Details and rerender Checkout State after success.
- [ ] After a successful Delivery Details mutation, clients rerender or rerun Checkout State when they need recomputed state.
- [ ] Tests cover successful Manual save, idempotent repeated save, invalid input, provider failure, version conflict, and policy-violating-but-structurally-valid address save.
- [ ] Adapter tests cover structured failure mapping for the Delivery Details save path.
- [ ] Relevant typecheck and test commands pass.

## Blocked by

- `.scratch/checkout-effect-slice/issues/01-checkout-effect-kernel-and-current-state-tracer.md`
- `.scratch/checkout-effect-slice/issues/07-commerce-request-context-resolver.md`
- `.scratch/checkout-effect-slice/issues/02-manual-contact-save.md`
