# Address Book domain and capability contract

Type: grilling
Status: resolved
Blocked by: 01, 02

## Question

Define the provider-independent, schema-backed Address Book model and Effect capability needed to list, get, and idempotently save Business Unit addresses with Shipping/Billing Address Types and Default Shipping/Default Billing flags. Specify authorization inputs, Address Book Reference identity, method contracts, typed failures, and the boundary between capability errors and provider Layers.

Keep Customer addresses, editing, deletion, and presentation concerns out of the contract.

## Answer

Define a provider-independent `AddressBook` `Context.Service`. It is a general Business Unit commerce capability consumed by Checkout, not a Checkout-specific service.

### Schema-backed model

- `AddressBookReference`: opaque branded reference whose provider representation is owned by the concrete Layer.
- `AddressType`: `shipping | billing`.
- `AddressBookEntry`: reference, canonical address, a non-empty set of Address Types, `defaultShipping`, and `defaultBilling`.
- `SaveAddressBookEntryInput`: stable reference, address, Address Types, and both default flags.

Default Shipping automatically adds the Shipping type, and Default Billing automatically adds the Billing type. Saving a new default moves that Business Unit default to the new entry. Address editing, deletion, and default removal are not part of this capability slice.

### Concrete operations

```text
list() -> all entries in the current Business Unit Address Book
get(reference) -> the current canonical entry in that Business Unit
save(input) -> the newly saved or already-existing canonical entry
```

The selected Address Book Layer obtains the existing verified `CustomerCommercePrincipal` from request-scoped `CommerceContext`; that principal already identifies the acting Customer and Business Unit Buying Context. There is no new abstract Address Book Scope and no caller-submitted Customer or Business Unit identifier.

Checkout presents only entries whose Address Types include Shipping. When an existing reference is submitted, Checkout calls `get` and saves that canonical address to the Cart; it never trusts a copied address from the caller.

### Save and retry contract

`save` is an add operation with first-write-wins reference idempotency:

- an absent reference atomically adds the Business Unit address, requested Shipping/Billing types, and requested default markers;
- an existing reference returns its current canonical entry without comparing submitted address fields or issuing another Business Unit write;
- a different reference may create another entry with the same postal address.

If `save` succeeds and the subsequent Cart update fails, the Checkout failure carries the saved reference. Retry calls `get` with that reference and retries only the Cart update. It does not call `save` or compare address fields.

### Typed capability failures

- `CommerceRequestContextNotFound(noPrincipal)`: the request has no authenticated Customer principal, so no Business Unit Address Book is current.
- `AddressBookEntryNotFound`: the reference does not exist in the current Commerce Context's Business Unit. A reference from another Business Unit has the same result; the capability does not perform a cross-unit lookup.
- `AddressBookAccessDenied`: the current verified principal cannot perform the requested Business Unit address operation, including missing associate permission.
- `AddressBookProviderFailure`: the provider operation cannot complete after bounded concurrency or ambiguous-result recovery. It retains diagnostic cause information for logging.

Schema decoding failures are handled at the domain or adapter input boundary before a capability method runs. Provider payloads, generated address IDs, resource versions, associate-scoped request construction, raw provider errors, and bounded provider recovery stay inside the concrete Layer.
