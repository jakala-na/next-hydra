# Registration Storage Grill Scratch

## Observed code facts

- Legacy `RegistrationStorePort` is an application port over `RegistrationRecord`.
- Production registration persistence currently lives in `packages/commerce/lib/b2b-registration/service.ts`.
- That storage record also carries workflow hook tokens, commerce IDs, invitation state, auth identity, and approval timestamps.
- Effect package currently has in-memory `Registrations`, `Invitations`, and `CommerceAccounts` services.
- Durable workflow steps call legacy side-effect functions directly.
- Effect workflow source models workflows with `Workflow.make`, stable `idempotencyKey` derived execution IDs, and registered handlers through `toLayer`.
- Effect workflow source models durable side effects as `Activity.make`; activities must have stable names/schemas and external effects still need idempotency.

## Open decision tree

1. Resolved: persistent registrations store the domain `Registration` union only.
2. Resolved: `RegistrationId` is assigned by the registration domain.
3. Resolved: submit idempotency is not part of the repository design.
4. Resolved: distributed approval races require versioned writes.
5. Resolved: `Registrations` owns a single read-transition-versioned-write attempt, not retry policy.
6. Resolved: storage exposes `get` plus explicit versioned `update(current, next)`, not callback-style `modify`.
7. Resolved: `RegistrationStorage.insert` should be create-only, not upsert.
8. Resolved: storage versions should be opaque `StorageVersion` values, not raw provider versions.
9. Resolved: storage should encode/decode the `Registration` union directly with Effect Schema; no separate persisted DTO yet.
10. Resolved: listing/querying belongs in a separate read/query service, not `RegistrationStorage`.
11. Resolved: created ADR `docs/adr/0001-use-versioned-registration-storage.md`.
12. Open: whether provider metadata such as Commercetools `createdAt`, `lastModifiedAt`, `createdBy`, and `lastModifiedBy` should be exposed by `RegistrationStorage`.

## Current hypothesis

- Persist the existing `Registration` union as the domain write model.
- Keep `Registrations` as the domain-facing persistence service, with memory and durable layers.
- Treat Vercel Workflow as process orchestration, not as the source of registration truth.
- Do not design around Effect Workflow for this project.
- Vercel Workflow should call registration commands/microprograms and provider adapters at durable step boundaries.
- Effect provides `effect/unstable/persistence/KeyValueStore` with `get`, `set`, `remove`, `modify`, `clear`, `size`, `prefix`, `layerMemory`, `layerFileSystem`, `layerSql`, and `toSchemaStore`.

## Resolved

- Persistent registrations should store only the domain `Registration` union.
- Workflow metadata, provider payloads, retry state, email delivery records, and denormalized admin views do not belong in the persistent `Registration`.
- The registration domain creates `RegistrationId`.
- Registration persistence should be modeled as a pure aggregate repository keyed by `RegistrationId`.
- Submission idempotency is out of scope for the repository and can be modeled later as a separate application-level concern if needed.
- `Registrations` is the Effect service/port for the persistent registration aggregate. Do not add a second `RegistrationRepository` abstraction unless `Registrations` later splits into multiple responsibilities.
- Vercel Workflow is the durable process orchestrator. It should call registration commands/microprograms; it is not the source of registration truth.
- The lower provider-bound persistence dependency should expose versioned registration document semantics, not Commercetools custom-object language.
- Effect `KeyValueStore` may still be useful for simple stores, but it is not sufficient for registration transitions that must reject stale writes.
- `Registrations.markApproved` / `markRejected` should own one transition attempt: read current version, validate current state, construct next `Registration`, and attempt versioned update.
- Callers should not pass around `Versioned<Registration>` for normal commands.
- Retry/reload policy for `RegistrationWriteConflict` belongs in programs/workflow steps, not inside `Registrations`.
- Do not introduce a conflict-resolution helper yet. Programs can compose Effect retry primitives directly, and Vercel Workflow may provide durable retry through thrown exceptions.
- `RegistrationStorage` should expose versioned document IO, not callback-style domain mutation. Storage should not run arbitrary domain transition functions.
- `RegistrationStorage.insert` should represent strict create-only semantics. It should report `RegistrationAlreadyExists` when the provider says the document already exists.
- Storage versions should be opaque. Commercetools numeric custom-object versions should not leak beyond the Commercetools storage layer.
- `RegistrationStorage` owns encoding/decoding of the `Registration` union. `Registrations` works with domain objects, not JSON or persisted DTOs.
- Do not introduce a separate persisted DTO until there is a concrete migration/versioning problem.
- Provider object metadata is not automatically domain state. If registration needs created/updated timestamps or actors, model those facts explicitly in `Registration`; do not rely on Commercetools custom-object metadata as the domain source of truth.
- Existing admin list needs status filtering, free-text search over company/contact/email, cursor pagination, and stable sorting by `updatedAt` then `registrationId`.
- Query design is a separate phase from write repository design. Commercetools can query custom-object fields, but a generic storage abstraction may need either a query-specific port or a projected read model.
- Effect `KeyValueStore` has no `list`, `keys`, `entries`, or prefix scan. Its `prefix` helper only rewrites point-operation keys.
- Keep `RegistrationStorage` point-addressable and versioned. Put list/search/filter/pagination into `RegistrationQueries`.
- Effect codebase organizes provider implementations by capability/provider module and exports `layer*` constants from those modules. It does not use a generic `layers/` folder convention.

## Examples discussed

### Persistent domain shape

Persist:

```txt
AwaitingApprovalRegistration
ApprovedRegistration
RejectedRegistration
```

Do not persist inside `Registration`:

```txt
Vercel workflow run id
hook token
email delivery ids
raw WorkOS payloads
retry counters
provider response blobs
admin table denormalizations
submission idempotency keys
```

### Rejected generic key-value shape

Effect's `KeyValueStore` shape is:

```ts
get(key)
set(key, value)
remove(key)
modify(key, f)
```

This is too weak for approval race protection because `modify` does not promise distributed atomic compare-and-set semantics.

### Preferred lower persistence capability

```ts
type Versioned<A> = {
  readonly value: A
  readonly version: StorageVersion
}

class RegistrationStorage extends Context.Service<
  RegistrationStorage,
  {
    readonly get: (
      id: RegistrationId
    ) => Effect.Effect<Option.Option<Versioned<Registration>>, RegistrationStorageError>

    readonly insert: (
      registration: Registration
    ) => Effect.Effect<void, RegistrationStorageError | RegistrationAlreadyExists>

    readonly update: (
      current: Versioned<Registration>,
      next: Registration
    ) => Effect.Effect<void, RegistrationStorageError | RegistrationWriteConflict>
  }
>()("@repo/registration-effect/RegistrationStorage") {}
```

Rejected callback-style shape:

```ts
modify(id, f: (current: Registration) => Effect<Registration, DomainConflict>)
```

Reason rejected: it forces storage to host domain transitions or arbitrary effects, while Commercetools naturally offers versioned read and versioned write.

### Commercetools mapping

```txt
CustomObject.value   -> Registration
CustomObject.version -> Version
POST with version 0  -> insert(registration)
POST with version    -> update(current, next)
409 conflict         -> RegistrationWriteConflict
```

Commercetools custom objects use the same endpoint for create and update. Safe create requires sending `version: 0`; otherwise a create-looking request can behave like an upsert. The Commercetools layer should hide that detail behind `RegistrationStorage.insert`.

Provider version handling:

```txt
Commercetools CustomObject.version number -> StorageVersion string/brand
StorageVersion -> provider-specific version inside Commercetools layer only
```

### Provider metadata pressure

Commercetools custom objects include metadata such as:

```txt
id
version
versionModifiedAt
createdAt
lastModifiedAt
createdBy
lastModifiedBy
container
key
```

Current direction: keep provider metadata out of the `Registration` union and out of the core `RegistrationStorage` contract unless a concrete use case appears. Domain timestamps/actors should be modeled inside `Registration` or related domain objects when they matter to the business.

### Persistence encoding

Use Effect Schema encoding for the `Registration` union directly. The storage layer owns this conversion; the domain service receives decoded `Registration` values.

### Existing list behavior

Legacy `list-registrations.ts` currently:

```txt
loads up to MAX_CURSOR_WINDOW records
filters by status if provided
filters by free-text search over company name, contact first name, contact last name, and email
uses cursor `{ registrationId, updatedAt }`
sorts newest-first by updatedAt, then registrationId
returns detail DTOs for admin UI
```

This is a read/query concern, not part of the versioned write primitive.

### Query service split

```txt
RegistrationStorage
  get/insert/update by RegistrationId with StorageVersion semantics

RegistrationQueries
  list/search/filter/paginate
```

For KV-like providers without native list/query support, query support requires explicit indexes or projected read models, for example:

```txt
registrations/by-id/{id} -> Registration
registrations/index/updated/{updatedAt}:{id} -> id
registrations/index/status/{status}/{updatedAt}:{id} -> id
```

### Provider layer placement/name options

Provider-specific registration storage can live in `packages/commerce` because Commercetools custom objects are a commerce-provider implementation detail.

Resolved local shape:

```txt
packages/commerce/lib/effect/
  registration-storage.ts
  registration-queries.ts
```

Export layer names should make the Effect role clear:

```ts
export const layerRegistrationStorage = ...
export const layerRegistrationQueries = ...
```

Alternative if keeping the existing B2B folder:

```txt
packages/commerce/lib/b2b-registration/effect/
  registration-storage.ts
  registration-queries.ts
```

Alternative if grouping by provider capability:

```txt
packages/commerce/lib/commercetools/
  registration-storage.ts
  registration-queries.ts
```

Avoid a generic `layers/` folder unless the package already has that convention. Effect modules make layer-ness clear through exported names like `layer`, `layerConfig`, `layerMemory`, `layerSql`, `layerStoreRedis`, `layerBackingSql`, and `layerBackingKvs`.

### Memory test layer expectation

The memory implementation should simulate versioned writes, likely with `SynchronizedRef`, so tests can exercise the same stale-write conflict behavior as production.

### Approval race handling expectation

```txt
Reviewer A approves registration at version 3.
Reviewer B rejects the same registration, also based on version 3.
A writes version 4 successfully.
B's write fails with RegistrationWriteConflict.
Registrations.markRejected surfaces RegistrationWriteConflict.
The calling program decides whether to reload/retry.
If the program reloads and sees matching final state, it may return idempotently.
If the program reloads and sees an incompatible final state, it returns RegistrationTransitionConflict.
```

### Error responsibility split

```txt
RegistrationStorageError
  Provider, transport, or decode failure.

RegistrationWriteConflict
  Versioned write lost a persistence race.

RegistrationNotFound
  No Registration exists for the requested RegistrationId.

RegistrationTransitionConflict
  Current domain state does not allow the requested transition.
```

`Registrations` maps invalid current state to `RegistrationTransitionConflict`. It does not perform operational retries for `RegistrationWriteConflict`.

### Retry composition

Programs own retry composition for `RegistrationWriteConflict`, using Effect primitives and/or Vercel Workflow step retry behavior. A shared helper may become useful later only if workflow retry semantics settle into a repeated pattern.

## Design pressure

- Effect `KeyValueStore` is a good lower storage primitive for `Registrations`.
- `KeyValueStore` has no compare-and-set/versioned write API; `modify` is read-transform-set and backend atomicity is not guaranteed by the interface.
- If registration transitions need optimistic concurrency, wrap or extend the primitive behind `Registrations` rather than exposing Commercetools custom objects.
- Approval decision races require distributed persistence concurrency, not just in-process Effect locks.
- Effect `Semaphore`, `PartitionedSemaphore`, `SynchronizedRef`, and STM-style primitives are useful within one runtime, but they do not protect concurrent Vercel invocations.
- Commercetools custom object version checks are the current correct concurrency primitive for registration transition writes.
