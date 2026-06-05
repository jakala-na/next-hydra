# Address Book Delivery Details source

Status: ready-for-agent
Type: AFK

## Parent

`.scratch/checkout-effect-slice/PRD.md`

## What to build

Add Address Book as a Delivery Details Source after the Manual Delivery Details path is already proven through `CheckoutSession`. An authenticated buyer should be able to select an Address Book Reference from an external address book capability, submit that reference to Delivery Details, resolve it to the current canonical Shipping Address, save the resolved address to the Cart, and rerun Checkout State.

Address Book is not owned by Checkout, and Checkout State should not expose address choices. Delivery Details completion must rely on the resolved Shipping Address, not on preserving the Address Book Reference. Missing, stale, or inaccessible Address Book References should fail as structured Checkout Mutation Failures.

Authenticated buyer identity must come from resolved request context. The HTTP adapter must not trust `x-context-customer-id` or any submitted customer ID as the authority for Address Book access.

## Acceptance criteria

- [ ] `saveDeliveryDetails` supports Address Book Delivery Details Source.
- [ ] Address Book source requires a verified customer principal from request context.
- [ ] Address Book source accepts an Address Book Reference rather than a copied Shipping Address.
- [ ] Address Book references resolve through an Address Book capability outside Checkout State.
- [ ] Address Book references are authorized against the verified customer or Buying Context, not against a caller-supplied customer ID.
- [ ] Checkout State does not include address book choices or resolver option catalogs.
- [ ] The save operation resolves the Address Book Reference to a Shipping Address.
- [ ] The resolved Shipping Address is saved as Checkout Details on the Cart.
- [ ] Delivery Details completion depends on the resolved Shipping Address, not on preserving the reference.
- [ ] Missing, stale, or inaccessible Address Book References fail with structured Checkout Mutation Failures.
- [ ] Structurally valid resolved addresses can be saved even if they later produce Checkout Violations.
- [ ] The checkout UI can submit an Address Book Reference selected from an external resolver/capability and rerender Checkout State after success.
- [ ] The HTTP Delivery Details save adapter supports Address Book source through `CheckoutSession.saveDeliveryDetails`.
- [ ] Tests prove address book details cannot be read or saved by spoofing `x-context-customer-id`.
- [ ] Tests cover successful reference resolution, stale reference failure, inaccessible reference failure, provider failure, version conflict, and policy-violating-but-structurally-valid resolved address save.
- [ ] Relevant typecheck and test commands pass.

## Blocked by

- `.scratch/checkout-effect-slice/issues/03-manual-delivery-details-save.md`
- `.scratch/checkout-effect-slice/issues/07-commerce-request-context-resolver.md`
