# Persist registrations through versioned storage

Status: implemented

## Parent

`.scratch/registration-storage/PRD.md`

## What to build

Build the first vertical slice of persistent registration storage in the Effect registration package. The slice should keep `Registrations` as the domain-facing service while moving its persistence behind a schema-aware versioned key-value storage capability.

The completed slice should let registration programs create awaiting registrations, load registrations, approve registrations, and reject registrations through the same `Registrations` API as today, while enforcing provider-like optimistic concurrency in the storage implementation used by tests. A stale approval or rejection write must fail as a typed write conflict instead of silently overwriting a newer registration state.

Use the repo's Effect guidance before implementing: `effect-solutions show data-modeling services-and-layers error-handling testing`.

User stories covered: 1, 4, 5, 6, 7, 8, 11, 13, 15, 16, 19.

## Acceptance criteria

- [x] A schema-aware versioned key-value storage capability exists underneath `Registrations`.
- [x] The storage capability supports loading by registration ID, create-only insert, and version-checked update.
- [x] Storage versions are opaque to domain services and programs.
- [x] Create-only insert conflicts fail with a typed registration already-exists error.
- [x] Stale updates fail with a typed registration write conflict.
- [x] Storage-level failures are mapped to registration-domain persistence failures before callers see them.
- [x] `Registrations` still exposes the domain-facing create, get, approve, and reject behavior used by existing registration programs.
- [x] `Registrations` performs one read, validates the current domain state, builds the next `Registration`, and attempts one versioned write.
- [x] Invalid lifecycle transitions still fail as typed domain transition conflicts.
- [x] Storage write conflicts surface to callers; `Registrations` does not retry internally.
- [x] The persistent value is the domain `Registration` union, encoded and decoded with Effect Schema.
- [x] Workflow metadata, provider payloads, retry state, submission keys, and read-model denormalizations are not added to `Registration`.
- [x] The memory implementation enforces versioned write behavior rather than acting like a plain map.
- [x] Tests cover missing lookup, create-only insert, create conflict, storage failure mapping, successful versioned update, stale update conflict, approval, rejection, invalid transitions, and conflict propagation.
- [x] Existing registration onboarding program tests continue to pass through the refactored `Registrations` service.
- [x] The package typechecks with the repo's existing registration typecheck command.

## Blocked by

None - can start immediately
