# Build the registration onboarding Effect program

## Parent

`.scratch/registration/PRD.md`

## What to build

Build the first end-to-end registration onboarding proof of concept in `@repo/registration`. The slice should model reviewable registrations with Effect Schema, expose step-sized services with memory layers, and compose plain Effect programs for approving, rejecting, and accepting a registration approval invitation.

The executable model should start at `awaiting_approval`, keep registration status separate from invitation state, and make approved/rejected registration states structurally complete. Approval should provision a commerce customer and business unit, issue a system-owned owner invitation, and store the complete approved registration. Rejection should store the complete rejected registration without creating commerce resources or invitations. Registration invitation acceptance should link the accepted auth identity to the commerce customer and business unit.

## Implementation context

Use the repo's Effect guidance before implementing: `effect-solutions show data-modeling services-and-layers error-handling testing`.

Start from the PRD's proposed package shape:

```text
registration/
  domain/
    identity.ts
    roles.ts
    actors.ts
    commerce.ts
    approval.ts
    registration.ts
    invitations.ts

  services/
    registrations.ts
    invitations.ts
    commerce-account.ts
    company-invitation-policy.ts

  programs/
    registration-onboarding.ts
    company-user-onboarding.ts

  providers/
    commercetools/
      registrations.ts
      commerce-account.ts
      index.ts

    workos/
      invitations.ts
      index.ts
```

Only `domain`, `services`, and `programs` are required for this first POC. Provider folders are the intended future home for real Commercetools and WorkOS layers, but they do not need implemented live providers.

Preserve these domain shapes from the PRD. They are decision examples, not final copy-paste implementation:

```ts
Email = branded email string
AuthUserId = branded string

AcceptedInvitationIdentity {
  authUserId
  email
  firstName
  lastName
}

RegistrationReviewerActor {
  actorType: "registration_reviewer"
  authUserId
  email
  name
}

SystemActor {
  actorType: "system"
  name
}

ApprovedDecision {
  decision: "approved"
  actor: RegistrationReviewerActor
  reason
  decidedAt: Date
}

RejectedDecision {
  decision: "rejected"
  actor: RegistrationReviewerActor
  reason
  decidedAt: Date
}

CompanyAddress {
  streetName
  additionalStreetInfo
  postalCode
  city
  region
  country
}

CompanyRegistrationDetails {
  companyName
  companyPhone
  vatId
  contactFirstName
  contactLastName
  email
  address
}

CommerceAccount {
  registrationId
  customerId
  businessUnitId
}
```

Registration state must be a discriminated union:

```ts
AwaitingApprovalRegistration {
  _tag: "AwaitingApprovalRegistration"
  id
  details
  createdAt
  updatedAt
}

ApprovedRegistration {
  _tag: "ApprovedRegistration"
  id
  details
  decision: ApprovedDecision
  commerceAccount
  invitation: PendingRegistrationInvitation | AcceptedRegistrationInvitation | RevokedRegistrationInvitation
  createdAt
  updatedAt
}

RejectedRegistration {
  _tag: "RejectedRegistration"
  id
  details
  decision: RejectedDecision
  createdAt
  updatedAt
}
```

Invitation state remains separate from registration status. Registration approval invitations are system-issued and grant `owner`:

```ts
RegistrationApprovalInvite {
  purpose: "registration_approval"
  registrationId
  role: "owner"
}

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

PendingRegistrationInvitation = PendingInvitation & {
  purpose: RegistrationApprovalInvite
}

AcceptedRegistrationInvitation = AcceptedInvitation & {
  purpose: RegistrationApprovalInvite
}

RevokedRegistrationInvitation = RevokedInvitation & {
  purpose: RegistrationApprovalInvite
}
```

Use these service boundaries:

```ts
Registrations {
  createAwaitingApproval(input): Effect<AwaitingApprovalRegistration, RegistrationCreateError>
  get(id): Effect<Registration, RegistrationNotFound>
  markApproved(input): Effect<ApprovedRegistration, RegistrationTransitionError>
  markRejected(input): Effect<RejectedRegistration, RegistrationTransitionError>
}

Invitations {
  issue(input): Effect<PendingInvitation, InvitationIssueError>
  accept(input): Effect<AcceptedInvitation, InvitationAcceptError>
  revoke(input): Effect<RevokedInvitation, InvitationRevokeError>
}

CommerceAccount {
  createFromRegistration(registration): Effect<CommerceAccount, CommerceAccountError>
  linkRegistrantIdentity(input): Effect<CommerceAccount, CommerceAccountError>
  addAssociate(input): Effect<CommerceAccount, CommerceAccountError>
}
```

Registration onboarding programs for this ticket:

```ts
approveRegistration(input)
rejectRegistration(input)
acceptRegistrationInvitation(input)
```

Approval sequence:

```ts
registration = Registrations.get(registrationId)
decision = ApprovedDecision(...)
commerceAccount = CommerceAccount.createFromRegistration(registration)
invitation = Invitations.issue(registration approval invite)
approved = Registrations.markApproved({ registration, decision, commerceAccount, invitation })
return approved
```

Registration invitation acceptance sequence:

```ts
invitation = Invitations.accept({ invitationId, acceptedIdentity })
CommerceAccount.linkRegistrantIdentity({ invitation, acceptedIdentity })
registration = Registrations.get(invitation.purpose.registrationId)
return registration
```

## Acceptance criteria

- [ ] Domain schemas model identity, actors, roles, approval decisions, commerce outcomes, registrations, and invitations with Effect Schema classes or discriminated unions.
- [ ] Registration lifecycle starts at `awaiting_approval`; no `submitted`, `approval_processing`, or UI validation states are introduced.
- [ ] Approved registrations cannot be represented without approval decision data, commerce IDs, and registration approval invitation data.
- [ ] Rejected registrations cannot be represented without rejection decision data, and do not include commerce or invitation data.
- [ ] Service contracts expose command-style operations for registration creation/read/approval/rejection, commerce account provisioning/linking, and invitation issue/accept/revoke mechanics.
- [ ] Memory layers are colocated with the service contracts and use Effect-native time and ID generation through `Clock` and `Random.nextUUIDv4` where appropriate.
- [ ] The approve registration program provisions commerce, issues a system-owned owner invitation, and stores the complete approved registration.
- [ ] Approval retries are idempotent and do not create duplicate commerce resources or duplicate registration approval invitations.
- [ ] Incompatible repeated decisions fail with typed Effect errors: approved registrations cannot later be rejected, and rejected registrations cannot later be approved.
- [ ] The reject registration program stores a complete rejected registration and creates no commerce account or invitation.
- [ ] Commerce provisioning failure leaves the registration awaiting approval and issues no invitation.
- [ ] Invitation issuance failure after commerce provisioning leaves the registration awaiting approval and allows retry to reuse compatible commerce state.
- [ ] The accept registration invitation program links the accepted auth identity through commerce account behavior.
- [ ] Accepting the same registration invitation with the same auth user is idempotent.
- [ ] Accepting the same registration invitation with a different auth user fails with a typed conflict.
- [ ] Revoking an accepted invitation fails; access removal remains out of scope.
- [ ] Provider-specific IDs stay source-qualified, and Commercetools keys are not part of the domain model.
- [ ] Tests cover the externally observable program and service behavior using memory layers, without WorkOS, Commercetools, API routes, Vercel Workflow, or webhooks.
- [ ] The package typechecks with the repo's existing `@repo/registration` typecheck command.

## Blocked by

None - can start immediately.
