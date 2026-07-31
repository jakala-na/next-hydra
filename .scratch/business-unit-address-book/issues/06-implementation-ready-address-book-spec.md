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
- Add the provider-independent `AddressBook` `Context.Service` with `list`, `get`, and reference-idempotent `save` operations over the verified `CustomerCommercePrincipal`.
- Add fresh in-memory Layers for behavior tests.
- Add the Commercetools Layer using associate-scoped Business Unit reads and writes.
- Map Address Book-keyed Business Unit addresses, Shipping/Billing memberships, and Default Shipping/Default Billing markers into canonical entries.
- Encode the opaque reference as the Business Unit address key; add the address and all requested membership/default actions in one versioned update.
- On an existing key or ambiguous result, return the current canonical entry without comparing submitted address fields.
- Preserve access denial separately from entry-not-found and provider failures.
- Give the initial shared address on every newly registered Business Unit an Address Book key. Legacy unkeyed Business Unit addresses are outside this slice and are not backfilled.
- Add a migration that ensures the `owner` and `associate` Commercetools Associate Roles include `UpdateBusinessUnitDetails` without removing their existing permissions, because every authenticated buyer in a verified Business Unit Buying Context can save addresses.

Validation gate: Address Book service tests, Commercetools adapter tests, migration tests, `pnpm --filter @repo/commerce test`, and `pnpm --filter @repo/commerce typecheck`.

### `feat(checkout): persist delivery source and address reference`

- Extend the `orderCustomFields` Type with optional String field `checkoutDeliveryDetails` through a forward-only migration.
- Store only schema-backed delivery metadata in that field: source and optional current Address Book Reference. The built-in Cart Shipping Address remains the canonical address and is not duplicated in custom metadata.
- Update the checked-in schema snapshot and regenerate custom-field TypeScript helpers.
- Read metadata and the built-in Shipping Address together into resolved `CheckoutDeliveryDetails`.
- Write Shipping Address and delivery metadata in the same Cart update for anonymous and associate-scoped B2B paths.
- Existing selection persists source Address Book plus reference; new-and-save persists source Manual plus reference; Cart-only Manual clears the reference.
- Extend idempotency checks to include both the canonical Shipping Address and delivery metadata.
- Return the optional current reference through Checkout State while keeping Address Book option catalogs absent.

Operational gate before dependent code is deployed:

```bash
pnpm cli commerce migrate plan
pnpm cli commerce migrate
pnpm cli commerce schema export
pnpm cli commerce types generate
```

Use `pnpm cli --env-file /absolute/path/to/project.env ...` when targeting a non-default environment.

Validation gate: migration/type-generation tests, Cart mapper/action tests, Checkout State tests, `pnpm --filter cli test`, `pnpm --filter cli typecheck`, `pnpm --filter @repo/commerce test`, and `pnpm --filter @repo/commerce typecheck`.

### `feat(checkout): support Address Book delivery intents`

- Add the submitted Delivery Details union for new address, existing Address Book entry, and saved-new-address retry.
- Keep submitted Cart ID/version as optimistic concurrency only; verified request context remains the authority for Cart and Address Book access.
- Compose the Address Book Layer once in the shared Checkout runtime Layer.
- Extend `CheckoutSession.saveDeliveryDetails` with the resolved orchestration from the map: new Cart-only, new-and-save, existing entry, and Cart-only retry after partial save.
- Require Shipping type for every entry used by Delivery Details.
- Preserve source Manual for new-and-save and its retry.
- Carry the saved reference on Cart-phase failures without repeating Address Book save or comparing address fields.
- Add authenticated `GET /address-book`, returning schema-backed entries and no Customer/Business Unit identifiers from request payloads.
- Update `POST /checkout/delivery-details` to accept the intent union and `/checkout/current` to return the optional current reference without options.
- Map missing/cross-unit/Billing-only entries, access denial, Address Book provider failures, Cart conflicts, and partial failures to stable codes, schema-backed parameters, localized fallback messages, and internal diagnostic causes.
- Prove spoofed identity headers cannot read or save another Business Unit's addresses.

Validation gate: CheckoutSession tests, runtime Layer tests, Server Action state tests, HTTP route/security tests, `pnpm --filter @repo/commerce test`, `pnpm --filter api test`, and both package typechecks.

### `feat(checkout): add saved shipping-address selection`

- Load Address Book entries independently from Checkout State for authenticated B2B Checkout.
- Render Shipping entries as selectable cards and `Use a new address` as the final choice.
- Prefer the current reference, then Default Shipping; otherwise require an explicit choice.
- Add `Save this shipping address` and nested `Make default shipping address` controls to the new-address form.
- Keep Billing and Default Billing controls out of Delivery Details; those belong to Payment Options.
- Treat an empty successful list as the new-address experience and let load failures surface through the normal Checkout boundary.
- After a partial save, select the newly saved entry, preserve source Manual, show the localized Cart error, and retry only the Cart update.
- Add every label, status, and error to all supported locale files.
- Add focused component-render coverage for address selection, defaults, new-address controls, localized errors, pending state, and retry state.

Validation gate: focused component tests, translation shape/type checks, `pnpm --filter @repo/commerce test`, `pnpm --filter web typecheck`, and `pnpm turbo typecheck --concurrency=1` as the final serial workspace check.

### Tracker reconciliation

`.scratch/checkout-effect-slice/issues/06-address-book-delivery-details-source.md` is superseded because it covers only existing-reference resolution and contradicts the resolved requirement to preserve the current reference. Mark it `wontfix` and point it to this completed Wayfinder map. This ticket and its linked decisions are the canonical implementation plan.
