# Checkout save-and-use orchestration

Type: grilling
Status: resolved
Blocked by: 03

## Question

Define the Delivery Details action variants and Effect use-case orchestration for:

- selecting an existing Address Book Reference;
- entering a new Cart-only Shipping Address;
- entering a new Shipping Address and explicitly saving it to the Business Unit Address Book before using it.

Specify validation, Cart version conflicts, address-book failures, reference lookup, Checkout Mutation Failure mapping, Cart persistence, Checkout State recomputation, and behavior for policy-violating but structurally valid addresses. When the Business Unit address was saved before a Cart failure, the structured failure must carry its reference and the retry must use the existing-reference path to update only the Cart.

## Answer

Use a schema-backed submitted Delivery Details intent union distinct from resolved, Cart-owned `CheckoutDeliveryDetails`:

```text
ManualAddress
  type: manual
  shippingAddress
  saveToAddressBook: false

ManualAddress
  type: manual
  shippingAddress
  saveToAddressBook: true
  makeDefaultShipping: boolean

AddressBookEntry
  type: addressBook
  addressBookReference
```

The submitted Cart ID/version remains separate optimistic-concurrency input and never authorizes Cart or Address Book access.

### New address

Normalize and structurally validate the submitted address. With `saveToAddressBook: false`, save it directly to the Cart as Manual Delivery Details.

With `saveToAddressBook: true`, Checkout generates the new opaque Address Book Reference internally. Save the address with Shipping type and the submitted Default Shipping preference, use the returned canonical entry, and then copy its complete canonical address and key to the Cart. The resolved Delivery Details source is Address Book because the saved entry now owns the identity used by the Cart snapshot. Callers never invent a reference for an entry that Checkout is creating.

If Address Book save fails, fail the Delivery Details mutation and do not update the Cart.

### Existing Address Book entry

Call `AddressBook.get` with the verified Customer principal and submitted reference. Require the returned entry's Address Types to include Shipping, then save its canonical address to the Cart with source Address Book. A missing, stale, cross-Business-Unit, Billing-only, or inaccessible entry fails before the Cart write.

### Partial save retry

If the Address Book save succeeds but the Cart write fails, preserve the Cart-phase failure code and include the saved Address Book Reference as structured retry context. This applies to version conflicts and provider failures after the Business Unit write.

After Checkout refreshes its Cart version, the next submission uses the ordinary `AddressBookEntry` input with the saved reference. It calls `AddressBook.get`, requires Shipping type, resolves to source Address Book, and retries only the Cart update. It never calls `AddressBook.save` or compares address fields. Retry is not a distinct user intent because the first phase has already created an existing Address Book Entry.

### Cart persistence and state

All successful paths produce the existing resolved `CheckoutDeliveryDetails` and reuse the current idempotent Cart shipping-address write. Structurally valid resolved addresses are saved even when Checkout Policy later produces a violation. Checkout State is recomputed after success; it stores neither Address Book choices nor the retry reference.

### Failure mapping

- schema and intent decoding failures remain Checkout Mutation schema failures;
- missing, stale, cross-unit, or Billing-only references become stable Address Book entry-unavailable Checkout Mutation failures without leaking cross-unit existence;
- Address Book access denial becomes a stable authorization/source-unavailable mutation failure;
- Address Book provider failures become Checkout Mutation provider failures with address-book operation context;
- Cart version conflicts and Cart provider failures retain their existing public codes, augmented with the saved reference only when the Business Unit write already succeeded;
- HTTP and Server Action boundaries render localized messages from stable codes and structured parameters while retaining diagnostic causes for logging.
