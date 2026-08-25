# Commercetools Business Unit address identity and idempotency

Type: research
Status: resolved
Blocked by: None

## Question

Using Commercetools primary documentation, SDK types, and this repository's generated schema/client, determine:

- how Business Unit addresses are listed, added, and marked as shipping addresses through associate-scoped operations;
- whether address IDs, address keys, or another value should back the schema-safe Address Book Reference;
- the uniqueness and lifecycle guarantees of that identifier;
- the smallest reliable idempotency strategy for retrying a save-and-use intent after the Business Unit address was created but the Cart update failed;
- the relevant optimistic-concurrency and provider failure behavior.

Capture the evidence and recommend one provider-independent contract without implementing it.

## Research seed

Consumed from `../research/01-commercetools-address-identity-and-idempotency.md` during resolution.

## Answer

Use a schema-backed opaque `AddressBookReference` whose authority is always the trusted Business Unit Buying Context. The reference is generated before the first save intent and deterministically encoded by the Commercetools Layer as the Business Unit address `key`; generated Commercetools address IDs do not cross the capability boundary.

The capability catalog contains Business Unit addresses carrying an Address Book key and a Shipping or Billing Address Type. Checkout later filters that catalog to Shipping entries. Provider addresses without an Address Book key are outside this capability; new Registration-created Business Units assign the key to their initial shared address, and this slice does not backfill legacy Business Units.

Adding an entry uses one associate-scoped, versioned Business Unit update with ordered `addAddress` and requested Shipping/Billing membership and default actions referring to the same address key.

Retry idempotency is reference-based and does not compare address fields:

- no matching key during the initial save: add the address and all requested type/default markers atomically;
- an existing key: return the current canonical entry without another write or comparison against submitted address fields;
- concurrent, timeout, or ambiguous Business Unit result: reread by key and return the canonical entry when it exists before any bounded provider retry;
- a new reference may deliberately save the same postal address as another entry.

When the Business Unit save succeeds but the Cart update fails, return the saved Address Book Reference as part of the structured failure. The next Checkout submission uses the existing-reference path: get the canonical entry and retry only the Cart update. It does not invoke Address Book save again.

The Commercetools adapter must preserve provider facts needed by later capability design: address keys are unique only within one Business Unit, associate-scoped writes require the latest Business Unit version and the relevant update permission, and raw provider errors remain inside the Layer.
