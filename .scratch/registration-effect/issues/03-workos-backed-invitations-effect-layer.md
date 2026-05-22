# Add a WorkOS-backed Invitations layer

## Parent

`.scratch/registration-effect/PRD.md`

## What to build

Add a WorkOS-backed implementation of the existing `Invitations` service.

This slice should treat WorkOS as the invitation system of record. WorkOS owns invitation persistence, token validation, accepted/revoked status, expiration, accept URLs, inviter user IDs, acceptor user IDs, and provider-side lifecycle validation. `@repo/registration-effect` exposes the provider-neutral `Invitations` service. `@repo/auth-workos` exposes a WorkOS implementation of that service that delegates to the WorkOS SDK behind typed Effect boundaries.

Do not introduce a separate durable invitation store for this slice. The existing `Invitations.layerMemory` should be treated as a test/fake provider layer, not as the production storage model.

## Design direction

Keep the public domain-facing service name as `Invitations`.

The WorkOS layer should be an implementation detail:

```ts
Programs
  -> Invitations
    -> invitationsLayerWorkos
      -> @workos-inc/node SDK
```

The intended public layer shape is:

```ts
invitationsLayerWorkos: Layer.Layer<
  Invitations,
  Config.ConfigError
>
```

If the layer needs additional provider options, prefer a parameterized constructor:

```ts
makeWorkosInvitations(workos.userManagement)
```

but keep provider-specific options out of composed registration/company invitation programs.

## WorkOS invitation adapter

Add a narrow WorkOS invitation adapter in `@repo/auth-workos`. It should load config with Effect `Config`, use redacted secrets for the API key, and wrap SDK calls with `Effect.tryPromise`. Do not introduce a generic `WorkosClient` service; WorkOS SDK calls belong inside the provider-specific invitation implementation until there is a concrete reusable platform capability.

Example shape:

```ts
export const makeWorkosInvitations = (
  userManagement: Pick<
    WorkOS["userManagement"],
    "sendInvitation" | "getInvitation" | "acceptInvitation" | "revokeInvitation"
  >
) => Invitations.of(...)

export const invitationsLayerWorkos: Layer.Layer<
  Invitations,
  Config.ConfigError
>
```

`WorkOSInvitation` above should be the SDK-supplied invitation type from `@workos-inc/node`, not a locally maintained copy. If we later want stronger decoding, add a separate mapper/schema layer in a future pass. Do not recreate the WorkOS response shape by hand in this ticket.

## Invitations contract

The provider-ready `Invitations` service should support:

```ts
Invitations {
  issue(input): Effect<PendingInvitation, InvitationIssueError>
  get(invitationId): Effect<Invitation, InvitationReadError>
  revoke(input): Effect<RevokedInvitation, InvitationRevokeError>
}
```

Do not add listing to `Invitations` in this slice.

WorkOS can list invitations, but it cannot reliably list invitations for one commerce business unit unless clients opt into WorkOS organizations. This package should not force that cost or provider modeling choice onto clients. Company invitation listing can be handled later by a separate business-unit invitation index/read model that stores provider invitation IDs for query efficiency.

Do not add `findByToken` in this slice. Current WorkOS/AuthKit acceptance flows are provider-owned and frontend token acceptance is not part of this design round.

## Domain mapping

Use branded strings for provider invitation IDs:

```ts
const invitationId = InvitationId.make(workosInvitation.id)
```

Do not source locally generated IDs in the WorkOS adapter.

Map WorkOS invitation status into the existing domain invitation variants as far as the provider response allows:

- pending provider invitation -> `PendingInvitation`
- accepted provider invitation -> `AcceptedInvitation`
- revoked provider invitation -> `RevokedInvitation`

Provider fields that are useful and available from WorkOS, such as accept URL, created time, expiration time, accepted time, revoked time, inviter user ID, acceptor user ID, token, and role slug, may be used by the mapper. Do not leak WorkOS-specific naming through program inputs.

## Intent and issuer context

WorkOS invitations do not support arbitrary metadata for our full `InvitationIntent`.

For this slice:

- `issue(input)` can return a domain `PendingInvitation` using the `intent` and `issuedBy` already present in the input.
- `get(invitationId)` should be implemented only to the degree WorkOS can reconstruct the invitation lifecycle from provider data.
- Do not introduce intent metadata hacks into WorkOS invitation fields.
- Do not introduce a durable invitation store.

If future workflows need to reconstruct full domain intent by provider invitation ID, add a separate `InvitationContextIndex` or equivalent read model:

```ts
InvitationContextIndex {
  remember({ invitationId, intent, issuedBy })
  getContext(invitationId)
}
```

That index is not the invitation source of truth. It is correlation/query support for domain context that WorkOS does not store.

## Idempotency

Do not guarantee issue idempotency in this slice beyond whatever the provider naturally guarantees.

The previous memory-layer model treated compatible duplicate invitations as idempotent because it owned storage. The WorkOS-backed layer should not invent an idempotency guarantee without provider support or a dedicated correlation index.

Keep provider-owned lifecycle validation:

- revoked invitations cannot be accepted
- accepted invitations cannot be revoked if the provider rejects that transition
- missing provider invitations map to `InvitationNotFound`

## Error mapping

Extend invitation errors with a provider failure type:

```ts
export class InvitationProviderFailure extends Schema.TaggedErrorClass<InvitationProviderFailure>()(
  "InvitationProviderFailure",
  {
    operation: Schema.Literals(["issue", "read", "revoke"]),
    cause: Schema.Defect,
  }
) {}
```

Use these aliases:

```ts
type InvitationIssueError = InvitationConflict | InvitationProviderFailure;
type InvitationReadError = InvitationNotFound | InvitationProviderFailure;
type InvitationRevokeError =
  | InvitationNotFound
  | InvitationConflict
  | InvitationProviderFailure;
```

Provider 404-style failures should map to `InvitationNotFound`. Provider state-transition failures should map to `InvitationConflict`. Transport, auth, rate-limit, SDK, and unexpected provider failures should map to `InvitationProviderFailure`.

## Out of scope

- Listing invitations for company admins.
- A business-unit invitation index/read model.
- Webhook acceptance handling.
- Frontend token acceptance.
- Arbitrary intent encoding into WorkOS invitation metadata.
- A durable local invitation store.
- Supporting Clerk in the same pass.
- Building a lowest-common-denominator provider abstraction across WorkOS and Clerk.

## Acceptance criteria

- [x] `Invitations` has a provider-ready contract with `issue`, `get`, and `revoke`.
- [x] `Invitations.layerMemory` remains available and is treated as a test/fake provider layer.
- [x] `InvitationProviderFailure` and `InvitationReadError` are modeled with typed Effect errors.
- [x] WorkOS provider invitation IDs are wrapped with `InvitationId.make(...)`.
- [x] A narrow WorkOS invitation adapter wraps the promise-based WorkOS SDK with `Effect.tryPromise`.
- [x] The WorkOS adapter uses SDK-supplied invitation types from `@workos-inc/node`; no hand-maintained WorkOS invitation response type is introduced.
- [x] `invitationsLayerWorkos` delegates `issue`, `get`, and `revoke` directly to the WorkOS SDK.
- [x] `issue(input)` maps domain intent and issuer input into the provider request and returns a `PendingInvitation` from the provider response plus known input context.
- [x] `get(invitationId)` maps provider invitation status into a domain invitation variant where possible.
- [x] `revoke(input)` maps provider revocation into `RevokedInvitation` or typed invitation errors.
- [x] No invitation listing is added to `Invitations`.
- [x] No local durable invitation store is added.
- [x] No webhook acceptance flow is designed or implemented in this slice.
- [x] Tests cover WorkOS-layer mapping and error translation with a fake WorkOS SDK object, without making network calls.

Implementation note: `invitationsLayerWorkos.accept` is also implemented. Provider reads, accepts, and revokes map to `ProviderInvitationIntent` because WorkOS does not carry the full local policy intent.
