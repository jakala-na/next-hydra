# Address Book implementation slices and tracker reconciliation

Type: grilling
Status: resolved
Blocked by: 04, 05

## Question

Decide the smallest coherent implementation slices and commit sequence after the domain, orchestration, and UI decisions are resolved. Ensure the resulting route is implementation-ready across domain contracts, Effect capability and Layer boundaries, use-case flows, UI and adapter behavior, typed errors and localization, security, idempotency, acceptance criteria, and validation strategy.

Reconcile `.scratch/checkout-effect-slice/issues/06-address-book-delivery-details-source.md`: update or supersede it deliberately so the tracker has one clear implementation path and no contradictory acceptance criteria.

## Answer

Use four dependency-ordered commits. Each commit must preserve a working, reviewable boundary and include its behavior-focused tests.

### `feat(commerce): add Business Unit address book capability`

- Add schema-backed `AddressBookReference`, `AddressType`, `AddressBookEntry`, save input, and typed capability errors.
- Add request-scoped `CommerceContext`, then add the provider-independent `AddressBook` `Context.Service` with identity-free `list`, `get`, and reference-idempotent `save` operations. The selected Address Book Layer obtains the verified `CustomerCommercePrincipal` from `CommerceContext`; no parallel `CurrentAddressBook` Service exists.
- Add fresh in-memory Layers for behavior tests.
- Add the Commercetools Layer using associate-scoped Business Unit reads and writes.
- Map Address Book-keyed Business Unit addresses, Shipping/Billing memberships, and Default Shipping/Default Billing markers into canonical entries.
- Encode the opaque reference as the Business Unit address key; add the address and all requested membership/default actions in one versioned update.
- On an existing key or ambiguous result, return the current canonical entry without comparing submitted address fields.
- Preserve access denial separately from entry-not-found and provider failures.
- Give the initial shared address on every newly registered Business Unit an Address Book key. Legacy unkeyed Business Unit addresses are outside this slice and are not backfilled.
- Add a migration that ensures the `owner` and `associate` Commercetools Associate Roles include `UpdateBusinessUnitDetails` without removing their existing permissions, because every authenticated buyer in a verified Business Unit Buying Context can save addresses.

Validation gate: Address Book service tests, Commercetools adapter tests, migration tests, `pnpm --filter @repo/commerce test`, and `pnpm --filter @repo/commerce typecheck`.

### `feat(checkout): preserve saved shipping-address identity`

- Keep the built-in Cart Shipping Address as the complete canonical address snapshot used by both Cart and Order consumers; do not store a reference in place of the address or duplicate it in custom metadata.
- Preserve saved-address identity on the copied Shipping Address using its deterministic Address Book key.
- Read a recognized Address Book key together with the full built-in Shipping Address into resolved `CheckoutDeliveryDetails`; an address without a recognized key is Manual.
- Write the full Shipping Address and, for a saved entry, its key in one Cart update for anonymous and associate-scoped B2B paths.
- Existing selection and new-and-save persist source Address Book plus reference; Cart-only Manual omits the key and clears the previous saved identity.
- Extend idempotency checks to include both the complete Shipping Address and its derived source/reference.
- Return the optional current reference through Checkout State while keeping Address Book option catalogs absent.
- Define the complete submitted Delivery Details input union as Manual address input with save/default flags or an existing Address Book entry. Keep currently implemented mutation surfaces narrowed to Cart-only Manual input until orchestration supports the remaining inputs.

Validation gate: Cart mapper/action tests, Checkout State tests, `pnpm --filter @repo/commerce test`, and `pnpm --filter @repo/commerce typecheck`.

### `feat(checkout): support Address Book delivery intents`

- Accept the complete submitted Delivery Details input union at the mutation boundaries.
- Keep submitted Cart ID/version separate from authorization; verified request context remains the authority for Cart and Address Book access. Require Cart identity to match, but do not reject a narrow Checkout mutation only because its submitted version is stale.
- Compose the Address Book Layer once in the shared Checkout runtime Layer.
- Extend `CheckoutSession.saveDeliveryDetails` with the resolved orchestration from the map: Manual Cart-only, Manual with Address Book save preferences, and existing entry. Checkout generates the new Address Book Reference internally. After a partial save, the existing-entry input retries the Cart phase.
- Require Shipping type for every entry used by Delivery Details.
- Resolve new-and-save and a later existing-entry retry to source Address Book after the saved entry is loaded.
- Retry `ConcurrentModification` by resending the same narrow Cart action with the error's `currentVersion`, without rereading or analyzing Cart state. Carry the saved reference if the Cart retry is exhausted, without repeating Address Book save or comparing address fields.
- Add authenticated `GET /address-book`, returning schema-backed entries and no Customer/Business Unit identifiers from request payloads.
- Update `POST /checkout/delivery-details` to accept the intent union and `/checkout/current` to return the optional current reference without options.
- Map missing/cross-unit/Billing-only entries, access denial, Address Book provider failures, Cart mismatches, exhausted version-forward retries, and partial failures to distinct stable codes, schema-backed parameters, localized fallback messages, and internal diagnostic causes. Preserve a newly saved reference even when the Cart write succeeds but the response-state read fails.
- Prove spoofed identity headers cannot read or save another Business Unit's addresses.

Validation gate: CheckoutSession tests, runtime Layer tests, Server Action state tests, HTTP route/security tests, `pnpm --filter @repo/commerce test`, `pnpm --filter api test`, and both package typechecks.

### `feat(checkout): add saved shipping-address selection`

- Load Address Book entries independently from Checkout State for authenticated B2B Checkout.
- Render Shipping entries as selectable cards and `Use a new address` as the final choice.
- Prefer the current reference, then Default Shipping; otherwise require an explicit choice.
- Add `Save this shipping address` and nested `Make default shipping address` controls to the new-address form.
- Keep Billing and Default Billing controls out of Delivery Details; those belong to Payment Options.
- Treat an empty successful list as the new-address experience and let load failures surface through the normal Checkout boundary.
- After a partial save, select the newly saved entry, show the localized Cart error, and retry only the Cart update.
- Add every label, status, and error to all supported locale files.
- Add focused component-render coverage for address selection, defaults, new-address controls, localized errors, pending state, and retry state.

Validation gate: focused component tests, translation shape/type checks, `pnpm --filter @repo/commerce test`, `pnpm --filter web typecheck`, and `pnpm turbo typecheck --concurrency=1` as the final serial workspace check.

### Tracker reconciliation

`.scratch/checkout-effect-slice/issues/06-address-book-delivery-details-source.md` is superseded because it covers only existing-reference resolution and contradicts the resolved requirement to preserve the current reference. Mark it `wontfix` and point it to this completed Wayfinder map. This ticket and its linked decisions are the canonical implementation plan.
