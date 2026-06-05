# Customer Profile Contact source

Status: ready-for-agent
Type: AFK

## Parent

`.scratch/checkout-effect-slice/PRD.md`

## What to build

Add Customer Profile as a Contact Source after the Manual Contact path is already proven through `CheckoutSession`. An authenticated buyer should be able to save Contact from customer-profile details when those details can supply a complete Buyer Contact. Authenticated B2B Checkout should still require Buying Context when needed, and unresolved Buying Context should keep Contact incomplete.

This slice should use the existing customer account capability for profile details rather than creating a checkout-specific buyer service. Customer Profile remains a complete Contact Source, with no partial overrides. If the customer profile cannot provide required Buyer Contact details, the save should fail as a structured Checkout Mutation Failure.

Authenticated buyer identity must come from resolved request context. The HTTP adapter must not trust `x-context-customer-id` or any submitted customer ID as the authority for Customer Profile access.

## Acceptance criteria

- [ ] `saveContact` supports Customer Profile Contact Source.
- [ ] Customer Profile source requires a verified customer principal from request context.
- [ ] Customer Profile resolves a complete Buyer Contact from the current customer profile through the existing customer account capability.
- [ ] Customer ID is resolved from verified auth/session context or account lookup, not from a caller-supplied header.
- [ ] Customer Profile source does not support partial overrides in this slice.
- [ ] If Customer Profile lacks email address, first name, or last name, saving Contact fails with a structured Checkout Mutation Failure.
- [ ] Customer-profile Contact save records the provider-required contact details on the Cart.
- [ ] Authenticated B2B Contact completion requires Buyer Contact and required Buying Context.
- [ ] Unresolved Buying Context keeps Contact incomplete after guest-to-login merge scenarios.
- [ ] Buying Context is not treated as a Contact Source.
- [ ] Previously saved Contact details are re-evaluated against current Contact Source Policy.
- [ ] The checkout UI can save Customer Profile Contact when available and rerender Checkout State after success.
- [ ] The HTTP Contact save adapter supports Customer Profile source through `CheckoutSession.saveContact`.
- [ ] Tests prove customer profile details cannot be read or saved by spoofing `x-context-customer-id`.
- [ ] Tests cover successful Customer Profile save, incomplete profile failure, unresolved Buying Context, Buying Context present, and source-policy re-evaluation.
- [ ] Relevant typecheck and test commands pass.

## Blocked by

- `.scratch/checkout-effect-slice/issues/02-manual-contact-save.md`
- `.scratch/checkout-effect-slice/issues/07-commerce-request-context-resolver.md`
