# Manual Contact save

Status: complete
Type: AFK

## Parent

`.scratch/checkout-effect-slice/PRD.md`

## What to build

Add the first Contact mutation path through `CheckoutSession` for Manual Contact Source. A buyer should be able to submit manually entered Buyer Contact details, save them to the Cart through the Commercetools `CheckoutSession` layer, revalidate or rerun Checkout State, and see Contact become complete when the current Checkout allows Manual.

The mutation should be available through `CheckoutSession.saveContact`, then exposed through thin adapters. Next.js server actions and HTTP handlers should call the same `CheckoutSession` method through the checkout runtime layer. The mutation should be replacement-style and idempotent. It should return structured Checkout Mutation Failures for invalid input, disallowed Manual source, provider failure, and version conflict. Saving Buyer Contact must not change the authenticated buyer or Buying Context.

## Acceptance criteria

- [x] `saveContact` supports Manual Contact Source.
- [x] Manual Contact save is implemented as `CheckoutSession.saveContact` outside the HTTP boundary.
- [x] Server action or in-process application adapters can call `CheckoutSession.saveContact` directly.
- [x] The HTTP API exposes current-checkout Contact save behavior through a thin adapter.
- [x] HTTP Contact save obtains Checkout Scope from resolved request context, not from trusted customer or cart identity headers.
- [x] Contact save input includes the current cart reference needed for optimistic concurrency.
- [x] Contact save resolves the current Cart from Checkout Scope and does not trust a submitted cart id as the authorization boundary.
- [x] Manual Contact input requires email address, first name, and last name.
- [x] Phone number is optional Buyer Contact.
- [x] Saving Manual Contact records Buyer Contact details on the Cart.
- [x] Repeated saves with the same Manual Contact details are idempotent replacement-style mutations.
- [x] Contact completion derives from the saved Buyer Contact details and current Contact Source Policy.
- [x] Manual Contact Source can be allowed or disallowed by current checkout rules.
- [x] A disallowed Manual save fails immediately with a structured Checkout Mutation Failure.
- [x] Invalid Manual Contact input fails with structured schema/decode errors.
- [x] Provider failures and version conflicts map to structured Checkout Mutation Failures.
- [x] The checkout UI can submit Manual Contact and rerender Checkout State after success.
- [x] After a successful Contact mutation, clients rerender or rerun Checkout State when they need recomputed state.
- [x] Tests cover successful Manual save, idempotent repeated save, invalid input, disallowed source, provider failure, and version conflict.
- [x] Adapter tests cover structured failure mapping for the Contact save path.
- [x] Relevant typecheck and test commands pass.

## Implementation notes

- Commercetools stores Manual Buyer Contact on the Cart as `customerEmail` plus escaped JSON in a `checkoutContact` string custom field on cart custom type `hydra-cart-checkout`.
- The provider project must have `hydra-cart-checkout` with a string field named `checkoutContact`; provisioning that type is outside this buyer-path slice.
- HTTP `POST /checkout/contact` returns recomputed `CheckoutState` after save.

## Blocked by

- `.scratch/checkout-effect-slice/issues/01-checkout-effect-kernel-and-current-state-tracer.md`
- `.scratch/checkout-effect-slice/issues/07-commerce-request-context-resolver.md`
