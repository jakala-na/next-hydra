# Checkout address selection experience

Type: grilling
Status: resolved
Blocked by: 03, 04

## Question

Define the Checkout-only presentation and adapter plan for loading Business Unit Address Book entries outside Checkout State, choosing an existing or new address, explicitly opting into Address Book persistence, submitting schema-backed intent, rendering localized failures, preserving retry state, and rerendering Checkout after success.

Cover both the in-process Next.js path and public HTTP consumers while keeping the adapters thin.

## Answer

### Loading and selection

Authenticated B2B Checkout loads Address Book entries independently from Checkout State. The in-process Next.js path calls `AddressBook.list` directly with the verified Customer principal. Public consumers call authenticated `GET /address-book`; `GET /checkout/current` never returns the option catalog.

Render saved Shipping entries as selectable address cards with `Use a new address` as the final choice. Selection precedence is:

1. the current `addressBookReference` returned in Checkout Details, when present in the loaded entries;
2. the Default Shipping entry;
3. no automatic selection, requiring the buyer to choose.

Preselection never updates the Cart. The buyer must submit Continue.

A successful empty Address Book list opens the new-address path. Do not add a special manual fallback for Address Book load failures: a code defect must surface for correction, while a Commercetools outage also prevents reliable Cart operations.

### New-address controls

The new-address form keeps the existing Shipping Address fields and adds:

- `Save this shipping address`;
- nested `Make default shipping address`, available only when saving.

The saved entry always includes Shipping. Billing use and Default Billing controls belong to the later Payment Options experience, not Delivery Details.

### Current reference versus options

Persist an optional current `addressBookReference` with Cart-backed Checkout Details:

- existing saved address: source Address Book plus reference;
- new address explicitly saved: source Manual plus reference;
- new Cart-only address: source Manual and no reference, clearing any previous reference.

`GET /checkout/current` returns this single current reference as Checkout Detail. It still does not return address options. Delivery Details completion depends only on the resolved Cart Shipping Address, and later Address Book changes or deletion do not silently mutate or invalidate it.

### Partial-save retry experience

When the Business Unit address saves but the Cart update fails, return a stable localized Cart error plus the saved reference as structured retry state. Rerender with the newly saved entry selected, without asking the buyer to re-enter the address or reselect Save. Continue submits the saved-new-address retry intent, preserves source Manual, calls `AddressBook.get`, and retries only the Cart update.

### Adapters and localization

- Next.js loads choices and runs mutations in-process through the shared runtime Layer.
- `GET /address-book` resolves bearer identity and returns schema-backed Address Book entries.
- `POST /checkout/delivery-details` accepts the new, existing-entry, and saved-new-address-retry intent union.
- `/checkout/current` returns the optional current reference but no choices.
- Customer and Business Unit identity always come from verified request context, never payload fields.
- Every public label, warning, and error uses translation keys. HTTP failures expose stable codes, schema-backed parameters, and localized fallback messages; diagnostic causes remain internal for logging.
