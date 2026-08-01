# Business Unit Address Book and Checkout Use

Type: wayfinder:map
Status: complete

## Destination

Produce an implementation-ready specification for a Business Unit Address Book where authenticated buyers can list and add company addresses classified for Shipping, Billing, or both, including Default Shipping and Default Billing flags, while acting in a Business Unit Buying Context. Checkout selects Shipping entries, can explicitly save a new address to the Address Book, resolves the canonical Shipping Address, and saves it to the Cart.

The first release has no Customer address book, standalone address-management UI, address editing, address deletion, or separate address-administrator role.

## Notes

- Manual Delivery Details already saves a structurally valid Shipping Address to the Cart through `CheckoutSession.saveDeliveryDetails`.
- `.scratch/checkout-effect-slice/issues/06-address-book-delivery-details-source.md` already requires Address Book reference resolution outside Checkout State, but does not define the Address Book capability or add-address behavior.
- Checkout State must remain lean: Address Book choices are loaded through a separate capability and are not embedded in Checkout State.
- The Business Unit and Cart are separate versioned provider resources, so saving a new address and using it cannot be one atomic provider transaction.
- The implementation plan should follow the repository's Effect architecture: schema-backed domain values, typed expected failures, provider-independent `Context.Service` capabilities, provider-specific Layers, use-case orchestration, and thin UI/HTTP adapters.
- Research evidence lives under `research/`; a research ticket is not resolved until a Wayfinder execution consumes its note.

### Established scope

- An Address Book belongs to exactly one Business Unit. Customers never own Address Books.
- Any authenticated buyer authorized for the current Business Unit Buying Context can list, select, and add its addresses. The first release has no separate address-manager role.
- Checkout is the only Address Book UI in the first release.
- Delivery Details lets the buyer select an existing address or enter a new address.
- A new address remains Cart-only unless the buyer explicitly chooses to save it to the Business Unit Address Book.
- Save-and-use persists the Business Unit address first and then saves the resolved Shipping Address to the Cart.
- If the address is saved but the Cart update fails, the Delivery Details step fails with the saved reference; retry gets that canonical entry and retries only the Cart update.
- Address Book save is universal: it accepts an address, Shipping/Billing Address Types, and Default Shipping/Default Billing flags. Checkout selects only Shipping entries.
- Only Business Unit addresses carrying an Address Book key are Address Book Entries. New registrations create compatible keyed addresses; legacy unkeyed addresses are not backfilled in this effort.
- Setting Default Shipping automatically adds the Shipping type; setting Default Billing automatically adds the Billing type.
- A new address explicitly saved to the Address Book resolves to source Address Book, and Checkout copies its complete canonical address and key to the Cart.
- Delivery Details offers Save as Shipping and optional Default Shipping. Billing use and Default Billing belong to the later Payment Options experience.
- Checkout Details can preserve and return the optional current Address Book Reference, but Address Book option catalogs remain outside Checkout State.

## Decisions so far

- [Commercetools Business Unit address identity and idempotency](issues/01-commercetools-address-identity-and-idempotency.md) — Use a Business Unit-scoped opaque reference mapped to Commercetools `address.key`; retry a partial save-and-use failure by reference without comparing address fields or repeating the Business Unit write.
- [Current Address Book and Checkout seams](issues/02-current-address-book-and-checkout-seams.md) — Add a separate Address Book capability and a submitted Delivery Details intent union while reusing trusted Buying Context, scoped Cart persistence, resolved Checkout Details, and thin localized adapters.
- [Address Book domain and capability contract](issues/03-address-book-domain-and-capability-contract.md) — Use a universal `AddressBook` service over the verified Customer principal with schema-backed entries, address types/defaults, and concrete `list`, `get`, and reference-idempotent `save` operations.
- [Checkout save-and-use orchestration](issues/04-checkout-save-and-use-orchestration.md) — Accept Manual address input with save/default flags or an existing Address Book Entry; generate new references inside Checkout, resolve saved addresses to source Address Book, and carry the saved reference through Cart-phase failures so ordinary existing-entry retry updates only the Cart.
- [Checkout address selection experience](issues/05-checkout-address-selection-experience.md) — Load saved entries separately, prefer the current/default Shipping entry, offer explicit new-address persistence controls, preserve partial-save retry state, and expose only the current reference through Checkout State.
- [Address Book implementation slices and tracker reconciliation](issues/06-implementation-ready-address-book-spec.md) — Implement in four dependency-ordered commits spanning the Address Book capability, Cart metadata, Checkout orchestration/API, and localized selection UI; retire the narrower legacy issue.

## Not yet specified

No additional fog is currently sharp enough to add beyond the live child tickets.

## Out of scope

- Customer-owned address books.
- A standalone Business Unit address-management UI.
- Address editing and deletion.
- A separate address-administrator role.
- Billing address selection and Default Billing controls in Payment Options.
- Production implementation; this map ends when the implementation decisions are clear.
