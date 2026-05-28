# Registration POC PRD

## Problem Statement

The current B2B registration and onboarding flow is implemented across zod schemas, promise-based application factories, better-result errors, Commercetools custom object storage, WorkOS invitations, Vercel Workflow steps, and API/webhook boundaries. This works, but it makes the lifecycle hard to reason about and hard to test in isolation.

The team wants a parallel Effect-based proof of concept that models the registration approval and onboarding domain with Effect Schema, step-sized services, typed errors, memory layers, and composed programs. The goal is not to replace production code immediately. The goal is to create a precise executable model that can validate lifecycle decisions, make impossible states unrepresentable, and provide a foundation for future workflow and provider integrations.

## Solution

Create a new parallel model in the existing `registration` package. The package will define Effect Schema domain classes and discriminated unions for registrations, invitations, actors, identities, roles, approval decisions, and commerce account outcomes.

The POC will expose small, durable-operation-shaped services for registrations, invitations, commerce account provisioning, and company invitation policy. Plain exported Effect programs will compose these services for end-to-end behavior tests. Memory layers will live with the service contracts to provide a canonical local implementation for isolated testing.

The model will deliberately separate business flow from invitation mechanics. Invitations are a shared underlying mechanism used by registration-approved company onboarding and future existing-company user onboarding. Each invitation carries a purpose and role. Registration approval invitations are system-issued and grant the initial `owner` role. Company member invitations are issued by a company actor and initially grant only the `associate` role.

## User Stories

1. As a product engineer, I want a parallel Effect model of registration onboarding, so that I can validate domain behavior without changing production flows.
2. As a product engineer, I want registration state represented as discriminated unions, so that approved records cannot exist without required commerce and invitation data.
3. As a product engineer, I want invitation state represented separately from registration status, so that approval and invitation progress are not overloaded into one lifecycle field.
4. As a product engineer, I want lifecycle operations to return typed Effect errors, so that failure paths are explicit and testable.
5. As a product engineer, I want memory layers for services, so that onboarding flows can be tested without Commercetools, WorkOS, API routes, or workflows.
6. As a product engineer, I want composed Effect programs over step-sized services, so that local tests can exercise the whole flow while later workflow steps can map to the same operation boundaries.
7. As a product engineer, I want the POC to omit the `submitted` state, so that the model starts at the reviewable `awaiting_approval` lifecycle point.
8. As a registration reviewer, I want to approve a registration, so that a company account is provisioned and the registrant receives an onboarding invitation.
9. As a registration reviewer, I want to reject a registration, so that no commerce account or invitation is created.
10. As a registration reviewer, I want approval retries to be idempotent, so that repeated approval commands do not create duplicate commerce resources or invitations.
11. As a registration reviewer, I want incompatible repeated decisions to fail, so that an approved registration cannot later be rejected and a rejected registration cannot later be approved.
12. As a registrant, I want an approval invitation to grant the owner role, so that I become the initial company owner during onboarding.
13. As a registrant, I want accepting my invitation to link my auth identity to the commerce customer and business unit, so that I can operate in the newly created company.
14. As a company owner, I want to invite associates into an existing business unit, so that other users can join the company.
15. As a company owner, I want company member invitations to carry the intended role, so that the acceptance flow can apply the correct commerce assignment.
16. As a company owner, I want duplicate pending invites for the same business unit and email to be treated idempotently when compatible, so that resends and retries are safe.
17. As a company owner, I want a pending invite for the same business unit and email with a different role to fail, so that role changes are explicit.
18. As a company associate, I should not be able to issue company invitations, so that invitation authority remains with owners in the POC.
19. As a product engineer, I want invitation issuance policy separated from invitation state mechanics, so that authorization rules can evolve independently from the invitation store.
20. As a product engineer, I want accepted invitations to be non-revocable by invitation command, so that access removal is modeled as a separate company/commerce action later.
21. As a product engineer, I want invitation acceptance to be narrowly idempotent for the same auth user, so that retries do not break onboarding.
22. As a product engineer, I want invitation acceptance by a different auth user to fail, so that accepted invitations cannot change ownership.
23. As a product engineer, I want provider-specific IDs to stay source-qualified, so that WorkOS auth IDs, Commercetools customer IDs, and business unit IDs are not confused.
24. As a product engineer, I want Commercetools keys kept out of the domain model, so that provider-specific implementation details do not leak into the POC domain.
25. As a product engineer, I want registration fields modeled with basic schemas, so that lifecycle tests have realistic data without reproducing all UI validation.
26. As a product engineer, I want email modeled as a branded schema, so that common identity fields have one reusable domain representation.
27. As a product engineer, I want timestamps represented as `Date`, so that domain logic uses time values rather than serialized strings.
28. As a product engineer, I want services to use Effect `Clock`, so that tests can control time with Effect testing tools.
29. As a product engineer, I want generated local IDs to use Effect `Random.nextUUIDv4` where appropriate, so that ID generation remains Effect-native without a custom ID service.
30. As a product engineer, I want provider folders for future Commercetools and WorkOS layers, so that live integration code can be added without mixing provider details into domain contracts.

## Implementation Decisions

- Build the POC in the existing parallel `registration` package.
- Do not wrap or migrate the current zod/better-result registration package in the first POC.
- Use Effect Schema classes and discriminated unions for domain data.
- Use one domain file per concept rather than splitting schema files from type/helper files.
- Split identity from actors because accepted invitation identity is not itself an actor.
- Domain concepts:
  - Identity: branded `Email`, auth user ID, person names, accepted invitation identity.
  - Actors: `RegistrationReviewerActor`, `CompanyActor`, and `SystemActor`.
  - Roles: `owner` and `associate`.
  - Approval: approval decision includes the decision value and reviewer actor metadata.
  - Commerce: commerce account outcome includes `registrationId`, `customerId`, and `businessUnitId`; no fake commerce account ID and no Commercetools keys.
  - Registration: variants for awaiting approval, approved, and rejected.
  - Invitations: invitation ID, invitation purpose variants, invitation state variants, issued-by actor metadata.
- Collapse the production `submitted` and `awaiting_approval` distinction for this POC. The executable lifecycle starts at `AwaitingApprovalRegistration`.
- Keep registration status separate from invitation state.
- Model approved registrations so that required approval decision, commerce IDs, and invitation data are always present.
- Model rejected registrations so that rejected approval decision data is always present and commerce/invitation data is absent.
- Registration approval invitations are issued by `SystemActor`, not by the reviewer actor.
- Registration approval invitations always grant `owner`.
- Company member invitations initially grant only `associate`.
- Company actors include their company role. Owners may issue and revoke associate invitations; associates may not.
- Invitation records store `issuedBy` as an actor. Invitation purpose stores target context and role, not issuer details.
- Do not put a generic `idempotencyKey` into domain schemas. Idempotency comes from purpose-specific business keys:
  - Registration approval invitation uniqueness is based on `registrationId`.
  - Company member invitation uniqueness is based on pending `businessUnitId + inviteeEmail`, with role compatibility checks.
- Use provider-specific branded IDs where needed:
  - Auth identity uses auth user IDs.
  - Commerce uses customer IDs and business unit IDs.
  - Registration IDs are generated internally by the registrations service and may be UUID-backed.
  - Our own invitation IDs may be UUID-backed in memory.
- Use `Date` for domain timestamps.
- Use Effect `Clock` for service timestamps.
- Use Effect `Random.nextUUIDv4` for local generated IDs owned by this domain model.
- Use readable branded strings for memory provider IDs where helpful, such as deterministic customer and business unit IDs derived from the registration ID. Do not UUID-check provider IDs unless the provider contract guarantees UUIDs.
- Services should be step-sized and durable-operation-shaped:
  - Registrations create awaiting approval registrations with internally generated registration IDs, read registrations, mark approved, and mark rejected.
  - Commerce account creates from registration and links accepted identities.
  - Invitations issue/accept/revoke and enforce generic state rules.
  - Company invitation policy authorizes issue and revoke operations.
- Plain exported programs should compose services for complete flows:
  - Approve registration.
  - Reject registration.
  - Accept registration invitation.
  - Issue company member invite.
  - Revoke company member invite.
- Programs are functions, not services. They are deterministic compositions over services already in the environment.
- Programs should be split by business flow: registration onboarding and company user onboarding.
- Service methods should use command-style names.
- Program success values should return the relevant domain record. Failure should be represented through typed errors.
- Services may accept whole domain objects from prior steps, but persistence-changing methods must re-read current state and enforce idempotency/conflict rules.
- Keep memory layers colocated with service contracts for POC velocity and discoverability.
- Reserve future provider folders for Commercetools and WorkOS implementations.
- Avoid a `providers/memory` folder for now. If memory implementations grow too large, move them later while preserving public `layerMemory` names.
- Keep service errors beside the owning service or domain concept instead of creating a central error junk drawer.
- Do not introduce broad barrel exports. Keep the public surface explicit and avoid a large catch-all export file.

### Proposed File Structure

The POC should start with this structure:

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

Only `domain`, `services`, and `programs` are required for the first POC. Provider folders are the intended future home for real Commercetools and WorkOS layers, but they do not need to be implemented in the first pass.

### Domain Shape Examples

These snippets are not final implementation code. They capture the schema and state-shape decisions that should not be lost.

Identity and roles:

```ts
Email = branded email string
AuthUserId = branded string

AcceptedInvitationIdentity {
  authUserId
  email
  firstName
  lastName
}

CompanyRole = "owner" | "associate"
```

Actors:

```ts
RegistrationReviewerActor {
  actorType: "registration_reviewer"
  authUserId
  email
  name
}

CompanyActor {
  actorType: "company"
  authUserId
  email
  businessUnitId
  role: "owner" | "associate"
}

SystemActor {
  actorType: "system"
  name
}
```

Approval decisions:

```ts
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
```

Registration input:

```ts
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
```

Commerce account result:

```ts
CommerceAccount {
  registrationId
  customerId
  businessUnitId
}
```

Registration variants:

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

Invitation purposes:

```ts
RegistrationApprovalInvite {
  purpose: "registration_approval"
  registrationId
  role: "owner"
}

CompanyMemberInvite {
  purpose: "company_member"
  businessUnitId
  role: "associate"
}
```

Invitation variants:

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

Approved registration embeds a registration-specific invitation union so approved records cannot omit invitation data:

```ts
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

### Service Shape Examples

The service interfaces should be small and command-oriented.

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

CompanyInvitationPolicy {
  authorizeIssueInvite(input): Effect<void, InvitationPolicyError>
  authorizeRevokeInvite(input): Effect<void, InvitationPolicyError>
}
```

### Program Shape Examples

Registration onboarding programs:

```ts
approveRegistration(input)
rejectRegistration(input)
acceptRegistrationInvitation(input)
```

Company user onboarding programs:

```ts
issueCompanyMemberInvite(input)
revokeCompanyMemberInvite(input)
acceptCompanyMemberInvitation(input)
```

Approval program sequence:

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

Company member invite sequence:

```ts
CompanyInvitationPolicy.authorizeIssueInvite({ actor, inviteeEmail, role })
invitation = Invitations.issue(company member invite)
return invitation
```

## Testing Decisions

- Tests should focus on externally observable behavior of services and programs, not internal maps, mutation order, or helper implementation details.
- Tests should be colocated with the service or program behavior they cover.
- Memory layers should make the core flows runnable without WorkOS, Commercetools, API routes, or Vercel Workflow.
- Test layers should follow Effect patterns: colocated `layerMemory` and explicit layer replacement for failure scenarios.
- Avoid a broad exported `testLayerWith` testing DSL in the first POC. Use local failing layers in specific tests when needed.
- Core behavior tests should cover:
  - Approving a registration provisions commerce, issues a registration approval invitation, and stores a complete approved registration.
  - Approval retry does not create duplicate commerce resources or duplicate invitations.
  - Incompatible approval retry fails with a typed conflict.
  - Rejection stores a complete rejected registration and creates no invitation.
  - Rejecting an already approved registration fails.
  - Approving an already rejected registration fails.
  - Commerce provisioning failure leaves the registration awaiting approval and issues no invitation.
  - Invitation issuance failure after commerce provisioning leaves the registration awaiting approval and allows retry to reuse commerce state.
  - Accepting a registration approval invitation links accepted identity through commerce account behavior.
  - Accepting the same invitation with the same auth user is idempotent.
  - Accepting the same invitation with a different auth user fails.
  - Revoking an accepted invitation fails.
  - Company owner can issue associate invitations.
  - Company associate cannot issue associate invitations.
  - Duplicate pending company invite with the same role is idempotent.
  - Duplicate pending company invite with a different role fails.
- Prior art in the repo includes API registration tests, workflow tests, store tests, and schema tests around the existing registration package.
- Prior art from Effect examples supports service-local memory/test layers, state/ref services when inspection is necessary, and `@effect/vitest` for Effect-native tests.

## Out of Scope

- Migrating the existing production registration package to Effect.
- Replacing zod schemas in current app/API code.
- Replacing better-result usage in production registration flows.
- Implementing API routes, ORPC contracts, or frontend changes for the new POC.
- Implementing Vercel Workflow code for the new model.
- Implementing WorkOS or Commercetools live providers in the first pass.
- Modeling webhooks.
- Modeling notification/email side effects in the first POC.
- Modeling `submitted`, `approval_processing`, or `submission_incomplete` states.
- Modeling exhaustive country, region, phone, VAT, or UI-level validation.
- Modeling admin role hierarchy beyond `owner` and `associate`.
- Modeling company membership as a first-class persisted domain table.
- Modeling access removal after invitation acceptance.
- Modeling Commercetools keys in the domain.
- Publishing this PRD to GitHub or any external issue tracker.

## Further Notes

- The package should remain a parallel reference model until it proves useful.
- The model should not pretend provider-specific details do not exist. Provider-specific code should live behind service layers, with Commercetools and WorkOS implementations added later under provider-specific modules.
- The POC should preserve workflow parity by keeping service methods small enough to map to future durable Vercel Workflow steps.
- The first code pass should prioritize the domain model, memory services, composed programs, and behavior tests over live integration.
