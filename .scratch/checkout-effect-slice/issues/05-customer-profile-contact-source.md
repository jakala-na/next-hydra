# Customer Profile Contact source

Status: ready-for-agent
Type: AFK

## Parent

`.scratch/checkout-effect-slice/PRD.md`

## What to build

Add Customer Profile as a Contact Source after the Manual Contact path is already proven through the Checkout kernel. An authenticated buyer should be able to save Contact from customer-profile facts when those facts can supply a complete Buyer Contact. Authenticated B2B Checkout should still require Buying Context when needed, and unresolved Buying Context should keep Contact incomplete.

This slice should use the existing customer account capability for profile facts rather than creating a checkout-specific buyer service. Customer Profile remains a complete Contact Source, with no partial overrides. If the customer profile cannot provide required Buyer Contact facts, the save should fail as a structured Checkout Mutation Failure.

## Acceptance criteria

- [ ] `saveContact` supports Customer Profile Contact Source.
- [ ] Customer Profile resolves a complete Buyer Contact from the current customer profile through the existing customer account capability.
- [ ] Customer Profile source does not support partial overrides in this slice.
- [ ] If Customer Profile lacks email address, first name, or last name, saving Contact fails with a structured Checkout Mutation Failure.
- [ ] Customer-profile Contact save records the provider-required cart-backed contact facts.
- [ ] Authenticated B2B Contact completion requires Buyer Contact and required Buying Context.
- [ ] Unresolved Buying Context keeps Contact incomplete after guest-to-login merge scenarios.
- [ ] Buying Context is not treated as a Contact Source.
- [ ] Previously saved Contact facts are re-evaluated against current Contact Source Policy.
- [ ] The checkout UI can save Customer Profile Contact when available and rerender Checkout State after success.
- [ ] The HTTP Contact save adapter supports Customer Profile source through the same `saveCheckoutContact` program.
- [ ] Tests cover successful Customer Profile save, incomplete profile failure, unresolved Buying Context, Buying Context present, and source-policy re-evaluation.
- [ ] Relevant typecheck and test commands pass.

## Blocked by

- `.scratch/checkout-effect-slice/issues/02-manual-contact-save.md`

