# Commercetools Business Unit address identity and idempotency

## Recommendation

Use one schema-backed, opaque `AddressBookReference` string, scoped by the trusted Business Unit Buying Context. Generate it before the first save. The Commercetools adapter should encode it as the Business Unit address `key`; no Commercetools address ID or Business Unit identifier needs to cross the capability boundary.

The smallest provider-independent save contract is:

```text
saveShippingAddress(scope, reference, shippingAddress)
  -> AddressBookEntry(reference, shippingAddress)
  | AddressBookReferenceConflict
  | expected authorization / provider failures
```

Its idempotency rule should be explicit:

- an absent reference creates the entry;
- the same reference with the same canonical address returns the existing entry;
- the same reference with a different canonical address fails with `AddressBookReferenceConflict`;
- every list or resolve operation evaluates the reference inside the server-derived Business Unit scope.

Do not infer identity from address-field equality or a content hash. Two deliberate entries may contain the same postal address, and formatting changes make field-based retry detection unreliable.

## Evidence

### Associate-scoped list and update

Commercetools exposes associate-scoped Business Unit reads by ID/key and a Business Unit query endpoint. The acting Customer ID is part of the path. Updates use the same associate scope, require the current Business Unit `version`, and require `UpdateBusinessUnitDetails` for address actions; a missing permission returns `AssociateMissingPermission`. [Associate Business Units: reads and queries](https://docs.commercetools.com/api/projects/associate-business-units#get-businessunit-by-key-as-associate), [Associate Business Units: updates](https://docs.commercetools.com/api/projects/associate-business-units#update-businessunit-as-associate)

The repository's generated GraphQL contract exposes the equivalent scoped query, `asAssociate(businessUnitKey, associateId).businessUnit`, and the `updateBusinessUnit` mutation accepts `asAssociate`, a resource version, and ordered update actions. [Generated GraphQL query contract](../../../packages/commerce/gql/schema.graphql#L986), [generated GraphQL mutation contract](../../../packages/commerce/gql/schema.graphql#L8581)

A Business Unit exposes all `addresses` as well as `shippingAddresses` and `shippingAddressIds`. The address-book catalog for this feature should therefore be the Business Unit's shipping addresses, not every address. [Generated Business Unit projection](../../../packages/commerce/gql/schema.graphql#L1514)

### Adding and marking a shipping address

`addAddress` accepts an `AddressInput`, including a caller-supplied `key`. `addShippingAddressId` accepts either `addressId` or `addressKey`; the generated update-action union includes both actions. [Generated address input](../../../packages/commerce/gql/schema.graphql#L671), [generated address actions](../../../packages/commerce/gql/schema.graphql#L96), [generated update-action union](../../../packages/commerce/gql/schema.graphql#L1951)

Commercetools processes update actions in array order and applies all actions in one update atomically. Therefore the adapter can submit `addAddress` followed by `addShippingAddressId` using the same address key in one Business Unit update. This is an inference from the documented ordered/atomic update contract combined with the address-key form of the shipping action. [Resource update semantics](https://docs.commercetools.com/api/general-concepts#partial-updates), [Business Unit address actions](https://docs.commercetools.com/api/projects/business-units#add-address)

### Identifier choice and lifecycle

An address `id` is a provider identifier. Commercetools recommends letting the API generate it and using `key` instead. An address `key` is caller-defined, must be unique among the addresses of one Business Unit, and has a constrained format (`2..256` characters, `[A-Za-z0-9_-]`). [Common address type](https://docs.commercetools.com/api/types#baseaddress)

Consequences:

- Use the address key behind `AddressBookReference`; it can be allocated before the write and recognized after an ambiguous response.
- Keep the reference scoped to the Business Unit: Commercetools only guarantees address-key uniqueness within that Business Unit, not across the Project.
- Treat the key as immutable and never reuse it as an application invariant. Commercetools supports replacing and removing addresses by key, but does not document a permanent tombstone or immutable lifecycle for embedded address keys. [Business Unit change/remove actions](https://docs.commercetools.com/api/projects/business-units#change-address)
- Do not expose or persist the generated address ID as the domain reference. It cannot make the initial add retry-safe because it is not known before the first write.

## Idempotent provider algorithm

1. Generate a reference once per save intent using a provider-safe representation, for example `addr_<uuid-without-unsupported-characters>`. Preserve it in the failed checkout action state so resubmission uses the same value.
2. Read the Business Unit through the associate-scoped endpoint.
3. If an address with that key exists:
   - return it when its canonical Shipping Address matches and it is marked for shipping;
   - add only the shipping marker when the canonical address matches but the marker is absent;
   - return `AddressBookReferenceConflict` when the payload differs.
4. If absent, update the latest Business Unit version with two ordered actions: `addAddress` carrying the key, then `addShippingAddressId` carrying `addressKey`.
5. On `ConcurrentModification`, re-read and repeat only if the desired state is still absent. Commercetools explicitly recommends checking the newest state before retrying a 409. [Timeout and retry guidance](https://docs.commercetools.com/api/error-handling#concurrent-modification-error)
6. On a timeout, network failure, or 5xx, treat the result as ambiguous and re-read by the supplied key before issuing another write. Commercetools warns that a write may complete after a timeout or even a 500 response. [Update guarantees](https://docs.commercetools.com/api/general-concepts#update-guarantees), [POST retry guidance](https://docs.commercetools.com/api/error-handling#post-requests)
7. On a duplicate-key response, re-read and apply the same equality/conflict rule. Do not blindly retry the original add.

Use a small bounded retry count for concurrency/transient failures. If the Business Unit save ultimately fails, fail the Checkout Delivery Details step. If it succeeds but the Cart update fails, the next submission reuses the same reference and the existing address, then retries the Cart update without creating another address.

## Provider failures worth preserving as typed causes

- inaccessible Business Unit or acting Customer is not an Associate;
- `AssociateMissingPermission` for address writes;
- missing/stale Address Book Reference;
- `AddressBookReferenceConflict` for one save-intent reference reused with different address data;
- `ConcurrentModification` after bounded reconciliation;
- invalid address/key input or other non-retryable provider rejection;
- transient/ambiguous provider failure after bounded recovery.

The HTTP/UI boundary can map these causes to public error codes and localized messages; raw Commercetools codes and messages should remain adapter context.
