# Build the company member invitation Effect program

## Parent

`.scratch/registration-effect/PRD.md`

## What to build

Build the second end-to-end proof of concept program for existing-company member invitations in `@repo/registration-effect`. This slice should reuse the invitation mechanics introduced by the registration onboarding program while adding company actors, company invitation policy, and composed programs for issuing, revoking, and accepting company member invitations.

Company member invitations should be issued by a company actor, initially grant only the `associate` role, and carry purpose data for the target business unit, invitee email, and intended role. Authorization should be separated from invitation state mechanics so owner-only rules can evolve without changing the invitation store. Acceptance should reuse the same narrow idempotency and ownership-conflict rules as registration invitations.

## Implementation context

This issue builds on `.scratch/registration-effect/issues/01-registration-onboarding-effect-program.md`. Reuse the shared identity, role, invitation, and commerce ID domain concepts from that slice instead of creating a second invitation model.

Preserve these PRD domain shapes. They are decision examples, not final copy-paste implementation:

```ts
CompanyRole = "owner" | "associate"

CompanyActor {
  actorType: "company"
  authUserId
  email
  businessUnitId
  role: "owner" | "associate"
}

CompanyMemberInvite {
  purpose: "company_member"
  businessUnitId
  role: "associate"
}
```

Company member invitations should reuse the shared invitation state variants from the first ticket:

```ts
PendingInvitation {
  _tag: "PendingInvitation"
  id
  inviteeEmail
  purpose
  issuedBy: Actor
  createdAt
}

AcceptedInvitation {
  _tag: "AcceptedInvitation"
  id
  inviteeEmail
  purpose
  issuedBy: Actor
  acceptedBy: AcceptedInvitationIdentity
  createdAt
  acceptedAt
}

RevokedInvitation {
  _tag: "RevokedInvitation"
  id
  inviteeEmail
  purpose
  issuedBy: Actor
  revokedBy: Actor
  createdAt
  revokedAt
}
```

The purpose carries target context and intended role; the invitation record carries issuer metadata. Do not put a generic `idempotencyKey` into domain schemas. For company member invitations, uniqueness is based on pending `businessUnitId + inviteeEmail`, with role compatibility checks.

Keep authorization separate from invitation persistence. Use these service boundaries:

```ts
Invitations {
  issue(input): Effect<PendingInvitation, InvitationIssueError>
  accept(input): Effect<AcceptedInvitation, InvitationAcceptError>
  revoke(input): Effect<RevokedInvitation, InvitationRevokeError>
}

CompanyInvitationPolicy {
  authorizeIssueInvite(input): Effect<void, InvitationPolicyError>
  authorizeRevokeInvite(input): Effect<void, InvitationPolicyError>
}
```

Company user onboarding programs for this ticket:

```ts
issueCompanyMemberInvite(input)
revokeCompanyMemberInvite(input)
acceptCompanyMemberInvitation(input)
```

Company member invite sequence:

```ts
CompanyInvitationPolicy.authorizeIssueInvite({ actor, inviteeEmail, role })
invitation = Invitations.issue(company member invite)
return invitation
```

## Acceptance criteria

- [ ] Company actors include their business unit context and company role.
- [ ] Company member invitation purpose records the business unit, invitee email, and intended role without duplicating issuer metadata.
- [ ] Company member invitations initially grant only the `associate` role.
- [ ] Company invitation policy allows owners to issue and revoke pending associate invitations.
- [ ] Company invitation policy rejects associates attempting to issue or revoke company invitations with typed Effect errors.
- [ ] The issue company member invitation program composes policy authorization with shared invitation issuance mechanics.
- [ ] Duplicate pending company invitations for the same business unit and invitee email with the same role are idempotent.
- [ ] Duplicate pending company invitations for the same business unit and invitee email with a different role fail with a typed conflict.
- [ ] The revoke company member invitation program revokes pending invitations when authorized.
- [ ] Revoking an accepted company invitation fails; access removal remains out of scope.
- [ ] The accept company member invitation program records the accepted auth identity and is idempotent for retries by the same auth user.
- [ ] Accepting an already accepted company invitation with a different auth user fails with a typed conflict.
- [ ] Programs remain plain exported functions over services already present in the Effect environment, not services themselves.
- [ ] Memory layers remain local and canonical for isolated tests; no provider-specific WorkOS or Commercetools implementation is introduced.
- [ ] Tests cover the externally observable company invitation behavior using memory layers.
- [ ] The package exposes an explicit public surface without introducing a broad catch-all barrel export.
- [ ] The package typechecks with the repo's existing `@repo/registration-effect` typecheck command.

## Blocked by

- `.scratch/registration-effect/issues/01-registration-onboarding-effect-program.md`
