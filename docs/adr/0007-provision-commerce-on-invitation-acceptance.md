# Provision Commerce on Registration Invitation Acceptance

Status: Accepted

Registration approval issues the initial-owner invitation but does not create the Commerce customer or business unit. The approved Registration durably records whether onboarding is invited, accepted, expired, or revoked; active invitations block duplicate registration emails, while expired and revoked attempts do not. Verified acceptance atomically records the first accepted auth user before idempotently provisioning Commerce and linking the identity. Repeated acceptance is allowed only for that same auth user. This avoids orphaned Commerce companies, prevents a second identity with the same email from rebinding the company, and avoids false duplicate-email failures when an approved invitation expires before anyone joins, at the cost of making approval and company provisioning separate milestones.

Provider issuance is correlated by a durable registration-scoped checkpoint containing the exact provider invitation ID. A retry may recover only that ID; an invitation found by email alone produces `InvitationIssueOutcomeUnknown` and is never attached to the Registration.

The current Registration data set is disposable. Deployment of this schema therefore requires deleting all existing Registration records and registration invitation-issue checkpoints instead of migrating them. Runtime decoding intentionally rejects approved data without onboarding so a missed reset fails visibly rather than silently classifying legacy records as invited. Once Registration data is retained across deployments, future incompatible schema changes require an explicit migration rather than another reset.
