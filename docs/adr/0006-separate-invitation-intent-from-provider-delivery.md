# Separate Invitation Intent from Provider Delivery

Status: Accepted

## Context

Registration approval uses an identity-provider invitation to establish the company's initial administrator. WorkOS and Clerk expose different correlation data: WorkOS acceptance webhooks identify the provider invitation but do not retain application metadata, while Clerk application invitations can copy public metadata to the accepted user but do not emit an application-invitation acceptance webhook. Treating either provider resource as the complete Registration Invitation forces adapters to invent missing business intent.

## Decision

Registration owns Invitation intent, including the Registration correlation, company roles, and issuer. Authentication adapters own Invitation Delivery, including the provider ID, recipient, acceptance URL, timestamps, and provider lifecycle state.

Every issued Invitation exposes a concrete expiration deadline through the provider-neutral delivery model. Authentication adapters translate provider expiry into `expiresAt`; when an SDK accepts an explicit lifetime but does not expose the resulting deadline, the adapter sets that lifetime explicitly and derives the deadline from the provider creation timestamp.

Provider capabilities are split by domain intent. `RegistrationInvitations` exposes registration invitation issuance, acceptance, and revocation. `CompanyMemberInvitations` exposes company-member issuance only until durable company-owned invitation context exists. `InvitationDeliveries` provides the intent-independent provider lifecycle projection. No callable provider capability accepts the union of both intents.

Company Member Invitation issuance is deliberately non-idempotent until that durable company-owned context exists. A provider-confirmed duplicate is an `InvitationConflict`. If delivery may have succeeded but the provider response cannot be confirmed, the adapter returns `InvitationIssueOutcomeUnknown`; callers must reload provider-backed invitation state or ask the operator to verify delivery rather than retrying the create request. Durable idempotency keys, reconciliation, and resend behavior belong to the later company-owned invitation context slice.

Provider adapters may carry correlation metadata when supported, but that metadata is an adapter mechanism rather than the source of Registration meaning. Verified provider events are translated into Invitation Acceptance evidence before the Registration workflow resumes. WorkOS correlation starts from its invitation ID; Clerk correlation starts from invitation metadata copied to the created user.

Company-member intent carries a non-empty set of the domain Company Roles `admin`, `buyer`, and `approver`. The initial company member receives `admin` and `buyer`. These are business membership roles rather than identity-provider roles, so provider adapters must not collapse them into an identity-provider role. Clerk carries the full set in invitation public metadata. WorkOS invitations do not accept arbitrary metadata, so the WorkOS adapter writes the full invitation context and role set to User Management metadata after verified acceptance. Provider metadata is a non-authoritative projection and must not overwrite or narrow the business intent.

The acceptance interaction remains provider-owned. WorkOS uses its hosted acceptance flow. Clerk redirects to an application route that embeds Clerk's `SignIn` component and consumes the invitation ticket.

Registration Invitation expiration is application-owned orchestration because providers do not guarantee an expiration webhook. The durable Registration workflow races its invitation hook against `expiresAt`, confirms that the provider has not already accepted or revoked the delivery, persists the Registration onboarding outcome as expired, notifies the registrant to submit a new Registration, and then fails with `InvitationExpired`. Expiration does not change the approved Registration decision and does not resend its Invitation. Company Member Invitation resend policy remains separate and can be added with durable company-owned context.

## Consequences

Registration programs no longer ask providers to reconstruct intent or issuer data they may not store. Adapter reads return delivery state only. Registration acceptance supplies the known Registration intent while the adapter validates provider state and accepted identity.

Adding another provider requires mapping only the intent-specific capabilities it supports plus invitation delivery and acceptance evidence, not changing Registration lifecycle policy. Company-member issuance can be supported independently, while company-member acceptance and revocation require their own durable domain context before live provider adapters expose those operations.

The first company-member issuance slice cannot promise equivalent provider-native duplicate detection because Clerk and WorkOS expose different duplicate behavior. It does preserve the domain distinction between a confirmed conflict, a rejected provider request, and an ambiguous write outcome. The UI never offers an automatic retry for an ambiguous outcome.

Expired invitation acceptance and revocation fail with a typed `InvitationExpired` error rather than a generic conflict or provider outage. Registration workflows terminate unsuccessfully only after the expiration notification step succeeds, so notification retries do not become invitation resends.
