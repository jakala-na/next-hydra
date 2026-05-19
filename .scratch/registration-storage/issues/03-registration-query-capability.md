# Add registration query capability for admin listing

Status: ready-for-agent

## Parent

`.scratch/registration-storage/PRD.md`

## What to build

Add a separate registration query capability for admin listing behavior without expanding the point-addressable write storage contract. This slice should preserve the current admin list semantics while making query support an explicit dependency that can be implemented differently by different providers.

The completed slice should support listing registrations with status filtering, free-text search over company and contact fields, cursor pagination, and stable newest-first ordering. The implementation should remain separate from versioned writes so future key-value or projected-read-model providers are not forced into pretending they support generic predicates. Providers may implement this query capability and `VersionedKeyValueStore` over the same backend, such as Commercetools custom objects, but list/search/query operations must not be added to `VersionedKeyValueStore`.

User stories covered: 20, 21, 22, 23, 24.

## Acceptance criteria

- [ ] A registration query capability exists separately from versioned key-value write storage.
- [ ] The write storage capability remains limited to load, create-only insert, and version-checked update by registration ID.
- [ ] `VersionedKeyValueStore` does not grow list, search, or predicate query operations.
- [ ] Admin listing supports filtering by registration status.
- [ ] Admin listing supports free-text search over company name, contact first name, contact last name, and email.
- [ ] Admin listing supports cursor pagination.
- [ ] Admin listing sorts newest-first by update time and then registration ID for stable pagination.
- [ ] The query result shape is suitable for the existing admin registration list workflow.
- [ ] Tests cover status filtering, search fields, cursor behavior, stable sorting, and page boundaries.
- [ ] The implementation does not introduce a generic query builder yet.
- [ ] Provider-specific query implementation details remain outside the registration domain model.

## Blocked by

None - write storage is implemented; query capability can start independently.
