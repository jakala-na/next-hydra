# Effect Cart operations and Commercetools custom-fields writer

Status: wontfix
Type: AFK

## Parent

`.scratch/checkout-effect-slice/PRD.md`

## Why this is deferred

The first Checkout Effect slice deliberately leaves the existing Promise-based `CartService` and Commercetools-bound `CartRepository` intact. Contact and Delivery Details persistence therefore remains inside the concrete Commercetools `CheckoutSession` layer for this slice.

Do not introduce a temporary `CartStore` containing only Checkout mutations. That would start the Cart rewrite through a shallow duplicate interface that would later need to be replaced.

## What to build

Replace the existing Cart service/repository arrangement with a provider-neutral Effect Cart Operations interface and a Commercetools adapter. Migrate the existing Cart behaviors together, including scoped Cart reads, Cart creation, add item, remove item, change quantity, save Contact, and save Delivery Details.

`CheckoutSession` should retain provider-neutral Checkout orchestration and depend on the Effect Cart Operations interface. Commercetools SDK payloads, optimistic-concurrency handling, Custom Type requirements, and custom-field serialization belong inside the Commercetools Cart adapter.

Introduce a schema-inferred custom-fields writer when this rewrite or another concrete custom-field use case requires it. Do not expose a blind `ensureType()` operation because repeating `setCustomType` can destroy existing fields.

The redesigned writer receives the currently observed Custom Type as evidence and remains a pure action builder:

- no current type: produce `setCustomType` with the accumulated field values;
- matching current type: produce `setCustomField` actions;
- different current type: return a typed Custom Type conflict rather than replacing it;
- unset fields: preserve explicit `null` update semantics;
- field names and values: infer them from generated custom-field schemas.

The Commercetools Cart adapter owns request execution and conflict recovery. After `ConcurrentModification`, it reloads the same authoritative scoped Cart, supplies the refreshed Custom Type evidence to the writer, rebuilds the actions, and retries once. The pure writer does not perform reads, writes, or retries.

## Acceptance criteria

- [ ] A provider-neutral Effect Cart Operations interface covers the existing Cart behaviors rather than starting with a Checkout-only partial interface.
- [ ] The Commercetools Cart adapter implements that interface and owns all SDK request and response details.
- [ ] Existing Promise-based Cart service/repository paths are replaced as their callers migrate; no permanent parallel `CartStore` abstraction remains.
- [ ] `CheckoutSession` no longer imports Commercetools Custom Type keys, Commercetools update actions, or versioned-write infrastructure.
- [ ] The generated custom-field schemas provide type-safe Custom Type keys, field names, and field values to the custom-fields writer.
- [ ] The writer chooses `setCustomType` or `setCustomField` from current Custom Type evidence.
- [ ] The writer returns a typed failure when a different Custom Type is already present.
- [ ] `setCustomType` is never blindly repeated after a version conflict.
- [ ] A version conflict reloads the same authoritative scoped Cart, rebuilds the intended actions from refreshed evidence, and performs at most one retry.
- [ ] State-independent narrow Cart mutations continue to retry the same action with the provider-reported current version without rereading Cart state.
- [ ] No global Commercetools `ConcurrentModification` middleware is reintroduced.
- [ ] Tests cover absent, matching, and conflicting Custom Type evidence; conflict-time action rebuilding; retry exhaustion; and Cart identity preservation.
- [ ] Commerce tests, typechecks, formatting, and relevant application typechecks pass.

## Context

- Current Cart interface: `packages/commerce/lib/cart/types.ts`
- Current Cart service: `packages/commerce/lib/cart/cart.service.ts`
- Current Commercetools Cart repository: `packages/commerce/lib/cart/cart.repo.ts`
- Current Commercetools Checkout layer: `packages/commerce/lib/checkout/commercetools.ts`
- Current narrow Contact action builder: `packages/commerce/lib/cart/checkout-contact-actions.ts`
- Generated custom-field schemas: `packages/commerce/lib/custom-fields/generated/`

## Comments

- 2026-08-01: Deferred from the Checkout Address Book work. The current slice keeps provider persistence in the Commercetools `CheckoutSession` layer; the Cart Effect rewrite should move the whole seam once rather than introduce a contact-only Cart abstraction.
- 2026-08-01: Superseded by [Current Cart Service and Provider Layers](../../current-cart/map.md), the canonical Wayfinder map for the whole Cart seam. The new map replaces the provisional Cart Operations name with `CurrentCart` and `Carts` Effect Services and makes provider Layer composition part of the destination.
