# Manual Contact save

Status: ready-for-agent
Type: AFK

## Parent

`.scratch/checkout-effect-slice/PRD.md`

## What to build

Add the first Contact mutation path through `CheckoutSession` for Manual Contact Source. A buyer should be able to submit manually entered Buyer Contact details, save them to the Cart through the Commercetools `CheckoutSession` layer, revalidate or rerun Checkout State, and see Contact become complete when the current Checkout allows Manual.

The mutation should be available through `CheckoutSession.saveContact`, then exposed through thin adapters. Next.js server actions and HTTP handlers should call the same `CheckoutSession` method through the checkout runtime layer. The mutation should be replacement-style and idempotent. It should return structured Checkout Mutation Failures for invalid input, disallowed Manual source, provider failure, and version conflict. Saving Buyer Contact must not change the authenticated buyer or Buying Context.

## Acceptance criteria

- [ ] `saveContact` supports Manual Contact Source.
- [ ] Manual Contact save is implemented as `CheckoutSession.saveContact` outside the HTTP boundary.
- [ ] Server action or in-process application adapters can call `CheckoutSession.saveContact` directly.
- [ ] The HTTP API exposes current-checkout Contact save behavior through a thin adapter.
- [ ] HTTP Contact save obtains Checkout Scope from resolved request context, not from trusted customer or cart identity headers.
- [ ] Contact save input includes the current cart reference needed for optimistic concurrency.
- [ ] Contact save resolves the current Cart from Checkout Scope and does not trust a submitted cart id as the authorization boundary.
- [ ] Manual Contact input requires email address, first name, and last name.
- [ ] Phone number is optional Buyer Contact.
- [ ] Saving Manual Contact records Buyer Contact details on the Cart.
- [ ] Repeated saves with the same Manual Contact details are idempotent replacement-style mutations.
- [ ] Contact completion derives from the saved Buyer Contact details and current Contact Source Policy.
- [ ] Manual Contact Source can be allowed or disallowed by current checkout rules.
- [ ] A disallowed Manual save fails immediately with a structured Checkout Mutation Failure.
- [ ] Invalid Manual Contact input fails with structured schema/decode errors.
- [ ] Provider failures and version conflicts map to structured Checkout Mutation Failures.
- [ ] The checkout UI can submit Manual Contact and rerender Checkout State after success.
- [ ] After a successful Contact mutation, clients rerender or rerun Checkout State when they need recomputed state.
- [ ] Tests cover successful Manual save, idempotent repeated save, invalid input, disallowed source, provider failure, and version conflict.
- [ ] Adapter tests cover structured failure mapping for the Contact save path.
- [ ] Relevant typecheck and test commands pass.

## Blocked by

- `.scratch/checkout-effect-slice/issues/01-checkout-effect-kernel-and-current-state-tracer.md`
- `.scratch/checkout-effect-slice/issues/07-commerce-request-context-resolver.md`
