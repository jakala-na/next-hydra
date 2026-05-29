# Design Registration Storage

Status: partially-implemented

## Problem Statement

The registration domain now has an Effect-based model for the `Registration` aggregate, but persistence is still represented by legacy implementation details. Today, production registration data is stored in Commercetools custom objects together with workflow state, provider payloads, invitation state, commerce identifiers, and other operational fields. That makes it hard to tell which data is the domain source of truth and which data belongs to orchestration or provider integrations.

The next design step is to persist registrations in a way that preserves the domain model while still supporting real production constraints: durable serverless invocations, approval and rejection races, provider-backed optimistic concurrency, admin listing, and a Commercetools custom object implementation.

## Solution

Introduce a schema-aware versioned key-value storage capability underneath the existing `Registrations` service. The persistent value is the domain `Registration` union only. Workflow metadata, provider payloads, retry state, submission idempotency keys, and read-model denormalizations stay outside the aggregate.

`Registrations` remains the domain-facing service for creating registrations and applying approval or rejection transitions. It performs one transition attempt by loading the current registration with its storage version, validating the domain state, constructing the next registration, and attempting a versioned write. Storage-level failures are mapped at this service boundary before callers see them. Create conflicts become `RegistrationAlreadyExists`, stale update conflicts become `RegistrationConcurrentModification`, and lower-level read, encode, decode, transport, or provider failures become `RegistrationPersistenceFailure`.

Provider-specific persistence is implemented as Effect layers. The Commercetools layer stores the encoded `Registration` union in a custom object value, maps custom object versions to an opaque storage version, uses create-only semantics for inserts, and maps provider errors into generic storage errors. `Registrations` then maps those generic storage errors into registration-domain errors.

Listing, searching, filtering, and pagination are modeled as a separate `RegistrationQueries` capability. The write storage interface remains point-addressable and versioned; query behavior is allowed to depend on provider-specific indexing or projected read models. Do not add list, search, or predicate query operations to `VersionedKeyValueStore`.

## User Stories

1. As a registration domain maintainer, I want persistent storage to contain only the `Registration` union, so that the aggregate remains the source of truth for registration lifecycle state.
2. As a registration domain maintainer, I want workflow state to stay outside `Registration`, so that Vercel Workflow orchestration can evolve without changing the aggregate.
3. As a registration domain maintainer, I want provider response payloads to stay outside `Registration`, so that commerce, authentication, and email integrations do not leak into the domain model.
4. As a registration domain maintainer, I want `RegistrationId` to be assigned by the registration context, so that aggregate identity is not confused with workflow IDs or submission keys.
5. As a registration program author, I want `Registrations` to remain the domain-facing service, so that application programs do not need to depend on storage-provider concepts.
6. As a registration program author, I want approval and rejection operations to validate the current registration state before writing, so that invalid lifecycle transitions fail as domain conflicts.
7. As a registration program author, I want stale writes to fail explicitly, so that competing approval and rejection decisions cannot overwrite each other.
8. As a registration program author, I want write conflicts to surface to the program, so that retry and reload policy can be chosen per workflow step.
9. As a durable workflow author, I want retry policy to live in programs or workflow steps, so that Vercel Workflow durable retry behavior is not hidden inside storage.
10. As a durable workflow author, I want storage operations to be idempotency-aware at the caller boundary, so that repeated workflow steps do not accidentally create multiple registrations.
11. As a registration storage implementer, I want inserts to be create-only, so that a first write cannot accidentally overwrite an existing registration.
12. As a Commercetools storage implementer, I want create-only insert semantics to use custom object `version: 0`, so that existing objects are reported as provider conflicts instead of silently upserted.
13. As a Commercetools storage implementer, I want provider versions hidden behind an opaque storage version, so that domain code does not depend on Commercetools numeric version fields.
14. As a Commercetools storage implementer, I want concurrent modification errors mapped to registration write conflicts, so that callers handle them through domain-level error types.
15. As a registration storage implementer, I want storage to own encoding and decoding of the `Registration` union, so that domain services work with decoded domain values.
16. As a registration storage implementer, I want to avoid a separate persisted DTO until there is a concrete migration need, so that the first implementation stays small and aligned with the model.
17. As a registration storage implementer, I want provider metadata kept out of the core storage contract, so that custom object audit fields do not become accidental domain state.
18. As a registration domain maintainer, I want domain timestamps and actors to be modeled explicitly when they matter, so that business facts are not inferred from provider metadata.
19. As a test author, I want the memory layer to simulate versioned writes, so that tests can catch stale-write behavior before production.
20. As an admin UI implementer, I want a query capability for listing registrations, so that admin pages can paginate and filter without depending on write-storage internals.
21. As an admin user, I want to filter registrations by status, so that I can review awaiting, approved, or rejected registrations efficiently.
22. As an admin user, I want to search registrations by company and contact fields, so that I can find a registration from partial business context.
23. As an admin user, I want stable cursor pagination sorted by update time and registration ID, so that list pages do not skip or duplicate rows while browsing.
24. As a storage portability maintainer, I want query behavior separated from point writes, so that providers without native predicate queries can use indexes or read models later.
25. As a package maintainer, I want provider-specific layers to live with their provider package, so that Commercetools custom object details stay out of the registration domain package.
26. As a package maintainer, I want layer exports to be named clearly as Effect layers, so that composition sites can tell they are binding implementations to services.
27. As a future adapter author, I want the storage contract to avoid Commercetools terms, so that a key-value, SQL, or custom provider implementation can be added later.
28. As a future workflow implementer, I want Vercel Workflow steps to call registration programs, so that the workflow orchestrates durable steps while domain programs enforce state transitions.

## Implementation Decisions

- Keep `Registrations` as the domain-facing Effect service for the persistent registration aggregate. Do not introduce a second `RegistrationRepository` abstraction unless the service later splits into multiple responsibilities.
- Add a lower storage capability that exposes versioned document semantics for registrations: load by ID, create-only insert, and version-checked update.
- Treat `VersionedKeyValueStore`, `StoreConflict`, and `StoreError` as infrastructure-facing primitives. They are used by provider layers and tests, but they are not part of the package root domain API.
- Model storage versions as opaque values. Provider versions are translated inside provider layers and are not visible to domain programs.
- Make insert create-only. Duplicate registration IDs are represented as a typed already-exists error.
- Make update require the previously loaded versioned registration and the next registration value. Stale writes are represented as typed write conflicts.
- Map all storage-level errors at the `Registrations` boundary. `StoreConflict` from insert becomes `RegistrationAlreadyExists`; `StoreConflict` from update becomes `RegistrationConcurrentModification`; `StoreError` becomes `RegistrationPersistenceFailure`.
- Keep the storage contract free of submission keys and idempotency keys. Submission idempotency is an application-level concern and can be modeled separately.
- Persist the existing domain `Registration` union directly using Effect Schema encoding and decoding. Redacted values use persisted redacted codecs: storage encodes the underlying plaintext value required for later reads, while domain formatting and logging continue to render redacted labels. Do not introduce a persisted DTO until migration or compatibility pressure requires one.
- Keep provider metadata such as custom object creation time, modification time, and actor metadata outside the core domain union and outside the core storage contract unless a concrete product requirement appears.
- Treat domain `createdAt`, `updatedAt`, decision actors, and decision timestamps as explicit domain fields. Do not infer them from custom object metadata.
- Refactor the memory implementation to exercise the same versioned semantics as production storage, including stale-write conflict behavior.
- Keep `Registrations` responsible for one transition attempt: read current version, validate current state, construct the next registration, and attempt the versioned update.
- Surface write conflicts from `Registrations` instead of retrying internally. Programs and Vercel Workflow steps own retry, reload, and failure policy.
- Do not add a retry helper in the domain package yet. Effect retry primitives and Vercel Workflow durable retry behavior are sufficient until workflow composition is designed.
- Implement the Commercetools provider as an Effect layer in the commerce package. The layer stores the encoded registration in custom object value, maps provider versions to opaque versions, and maps provider errors into generic storage errors.
- For Commercetools inserts, include provider version zero to force create-only behavior and avoid accidental upsert.
- For Commercetools inserts and updates, map Commercetools `ConcurrentModification` or HTTP 409 responses to `StoreConflict`. Do not handle `DuplicateField` as a custom object create conflict; custom object key conflicts are represented by concurrent modification semantics.
- For Commercetools updates, include the previously loaded provider version so that stale writes are rejected by the provider.
- Separate read/query behavior into a `RegistrationQueries` capability. It handles list, search, filter, pagination, and sort semantics without expanding the write storage interface.
- Providers may implement `VersionedKeyValueStore` and `RegistrationQueries` over the same backend, such as Commercetools custom objects, but the capabilities remain separate because write concurrency and admin query semantics are different contracts.
- Preserve current admin list behavior as the initial query target: status filtering, free-text search over company and contact fields, cursor pagination, and stable newest-first ordering by update time and registration ID.
- Defer a generic query builder design. Commercetools can use custom object predicates, while key-value providers may need explicit indexes or projected read models.
- Keep Vercel Workflow out of this PRD except as a caller. Workflow steps should call registration programs and provider-backed services, but workflow orchestration is not the registration source of truth.

## Testing Decisions

- Test external behavior through service contracts and programs rather than asserting internal implementation details.
- Add contract-style tests for registration storage semantics: missing registration lookup, create-only insert, create conflict, successful versioned update, and stale-write conflict.
- Add `Registrations` tests for lifecycle behavior over versioned storage: create awaiting approval, approve awaiting registration, reject awaiting registration, reject approved registration failure, approve rejected registration failure, missing registration failure, storage failure mapping, and stale write propagation.
- Keep memory layer tests meaningful by making the memory layer enforce versions instead of behaving like a plain map.
- Add program-level tests showing that approval and rejection surface storage conflicts without hiding retry policy.
- Add Commercetools provider tests around request shape and error mapping. The important behaviors are `version: 0` on insert, provider version on update, concurrent modification mapping, and schema decode failures.
- Add query service tests that preserve existing admin list semantics: status filters, search fields, cursor behavior, stable sorting, and page boundaries.
- Reuse the existing Effect test style in the registration package for service and program tests.

## Out of Scope

- Designing Vercel Workflow composition beyond the fact that workflow steps call registration programs.
- Designing Effect Workflow usage.
- Designing authentication provider, invitation provider, email provider, or commerce account provider contracts.
- Designing a general query builder for registration predicates.
- Designing submission idempotency storage.
- Designing custom read-model projections for key-value providers.
- Migrating existing legacy registration custom objects.
- Persisting workflow hook tokens, email delivery records, raw provider payloads, retry counters, or provider audit metadata inside `Registration`.
- Exposing Commercetools custom object metadata through the core storage contract.

## Further Notes

- The architectural decision is recorded in the ADR for versioned key-value storage behind registrations.
- The domain glossary should continue to distinguish `Registration`, `RegistrationId`, and submission keys.
- The current storage design intentionally borrows the simplicity of Effect's key-value services for point operations, but it does not use a generic key-value interface because registration transitions need provider-backed optimistic concurrency.
- The write-side aggregate persistence and Commercetools custom object layer are implemented. Query support is the next design phase after the write-side aggregate persistence is settled.
