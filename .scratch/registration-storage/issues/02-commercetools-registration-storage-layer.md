# Add Commercetools versioned key-value store layer

Status: implemented

## Parent

`.scratch/registration-storage/PRD.md`

## What to build

Bind the schema-aware versioned key-value storage capability to Commercetools custom objects as an Effect layer in the commerce package. The layer should hide custom object mechanics behind the generic storage contract and preserve domain-only values for registration callers.

The completed slice stores schema-encoded values in the custom object value, translates custom object versions to the opaque store version used by the registration package, forces create-only insert behavior, and maps provider errors into generic store errors.

This issue covers the infrastructure storage layer only. `Registrations` maps generic storage errors into registration-domain errors at its own boundary.

User stories covered: 2, 3, 11, 12, 13, 14, 15, 17, 18, 25, 26, 27.

## Acceptance criteria

- [x] A Commercetools-backed Effect layer implements the versioned key-value store capability.
- [x] Registration callers store only the encoded domain `Registration` union as the custom object value.
- [x] The layer does not persist workflow hook tokens, provider response blobs, email delivery records, retry counters, submission keys, or admin denormalizations inside `Registration`.
- [x] Custom object versions are translated into opaque store versions and do not leak to domain programs.
- [x] Insert uses Commercetools create-only semantics by sending provider version zero.
- [x] Existing-key insert conflicts map to the typed conflict error from the storage contract.
- [x] Update sends the provider version from the previously loaded registration.
- [x] Provider concurrent modification responses map to typed store conflicts.
- [x] Provider transport, decode, encode, and unexpected failures map to typed store errors.
- [x] Provider metadata such as custom object creation time, modification time, and actor metadata is not exposed through the core store contract.
- [x] Tests verify request shape for insert and update, including provider version zero on insert.
- [x] Tests verify concurrent modification, decode failure, and unexpected provider error mapping.
- [x] The commerce package typechecks with the repo's existing command for that package.

## Implementation notes

- Implemented as `layerCommercetoolsCustomObjectKeyValueStore` in the commerce package.
- The layer imports the generic storage primitives from the registration package infrastructure module path, not the registration package root.
- Commercetools create-only conflicts are treated as concurrent modification conflicts from `version: 0`; this layer does not handle `DuplicateField` as a custom object key conflict.
- Redacted domain values are encoded through persisted redacted codecs. Storage contains the underlying value needed for decoding, while domain log formatting remains redacted.

## Verification

- `pnpm --filter @repo/commerce test -- lib/infra/commercetools/key-value-store.test.ts`
- `pnpm --filter @repo/commerce typecheck`

## Blocked by

None - completed after `.scratch/registration-storage/issues/01-versioned-registration-storage-tracer.md`
