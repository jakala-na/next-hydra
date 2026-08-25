# Manual Delivery Details save

Status: complete
Type: AFK

## Parent

`.scratch/checkout-effect-slice/PRD.md`

## What to build

Add the first Delivery Details mutation path through `CheckoutSession` for Manual Delivery Details Source. A buyer should be able to submit a manually entered Shipping Address, save it to the Cart through the Commercetools `CheckoutSession` layer, rerun Checkout State, and see Delivery Details become complete when the Shipping Address is structurally valid.

The mutation should be available through `CheckoutSession.saveDeliveryDetails`, then exposed through thin adapters. Next.js server actions and HTTP handlers should call the same `CheckoutSession` method through the checkout runtime layer. The mutation should save structurally valid addresses even when policy evaluation later produces a Checkout Violation. It should be replacement-style and idempotent, with structured failures for invalid input, provider failure, and version conflict.

## Acceptance criteria

- [x] `saveDeliveryDetails` supports Manual Delivery Details Source.
- [x] Manual Delivery Details save is implemented as `CheckoutSession.saveDeliveryDetails` outside the HTTP boundary.
- [x] Server action or in-process application adapters can call `CheckoutSession.saveDeliveryDetails` directly.
- [x] The HTTP API exposes current-checkout Delivery Details save behavior through a thin adapter.
- [x] HTTP Delivery Details save obtains Checkout Scope from resolved request context, not from trusted customer or cart identity headers.
- [x] Delivery Details save input includes the current cart reference needed for optimistic concurrency.
- [x] Delivery Details save resolves the current Cart from Checkout Scope and does not trust a submitted cart id as the authorization boundary.
- [x] Manual Delivery Details input accepts a Shipping Address.
- [x] Delivery Details completion depends on the resolved Shipping Address.
- [x] Structurally valid Shipping Address details are saved to the Cart.
- [x] A structurally valid Shipping Address can be saved even if it later produces a Checkout Violation.
- [x] Repeated saves with the same Manual Shipping Address are idempotent replacement-style mutations.
- [x] Invalid Shipping Address input fails with structured schema/decode errors.
- [x] Provider failures and version conflicts map to structured Checkout Mutation Failures.
- [x] The checkout UI can submit Manual Delivery Details and rerender Checkout State after success.
- [x] After a successful Delivery Details mutation, clients rerender or rerun Checkout State when they need recomputed state.
- [x] Tests cover successful Manual save, idempotent repeated save, invalid input, provider failure, version conflict, and policy-violating-but-structurally-valid address save.
- [x] Adapter tests cover structured failure mapping for the Delivery Details save path.
- [x] Relevant typecheck and test commands pass.

## Implementation notes

- Commercetools stores the resolved Shipping Address in the Cart's standard `shippingAddress` field via a replacement-style `setShippingAddress` update action.
- Checkout names the provider-neutral Shipping Address fields `addressLine1` and `addressLine2`; the Commercetools adapter maps them to `streetName` and `additionalStreetInfo` and does not use `streetNumber`.
- Shipping Address country uses a branded ISO 3166-1 alpha-2 schema backed by the shared `@repo/i18n/countries` list; form input is trimmed and uppercased before membership validation, while HTTP input remains strict.
- HTTP `POST /checkout/delivery-details` and the Next.js server action both call `CheckoutSession.saveDeliveryDetails`, then rerun or revalidate Checkout State.
- Checkout reconstructs Manual Delivery Details from a structurally valid Cart Shipping Address; invalid or incomplete provider addresses leave Delivery Details incomplete.

## Blocked by

- `.scratch/checkout-effect-slice/issues/01-checkout-effect-kernel-and-current-state-tracer.md`
- `.scratch/checkout-effect-slice/issues/07-commerce-request-context-resolver.md`
- `.scratch/checkout-effect-slice/issues/02-manual-contact-save.md`
