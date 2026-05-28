# Thin workflow entrypoints over Registration programs

Status: ready-for-agent

## Parent

`.scratch/registration-use-case-programs/PRD.md`

## What to build

Make workflow entrypoints thin adapters over named Registration programs. Workflow code should coordinate workflow-specific sequencing and execution, but it should not own Registration lifecycle policy, provider orchestration, onboarding rules, or notification rules.

Registration onboarding should remain the workflow-called use case for executing accepted decisions: approving provisions Commerce, issues the owner invitation, and finalizes the approved Registration; rejecting finalizes the rejected Registration. Registration notifications should remain state-reading side-effect programs that send the relevant email for the current Registration state.

## Acceptance criteria

- [ ] Workflow entrypoints call named Registration programs for onboarding and notifications instead of embedding Registration policy.
- [ ] Workflow code remains responsible for workflow-specific mechanics only, such as step boundaries, hook payloads, and execution order.
- [ ] Registration onboarding remains responsible for Commerce provisioning, owner invitation issuance, and final approval/rejection state transitions.
- [ ] Registration notifications remain responsible for state-based email sending and do not decide lifecycle transitions.
- [ ] Workflow entrypoints do not import provider-specific adapters or provider payload shapes directly when a provider-independent capability/program surface exists.
- [ ] Workflow tests focus on workflow sequencing and program invocation rather than duplicating onboarding/notification policy tests.
- [ ] Existing onboarding tests continue to cover Commerce provisioning, invitation issuance, idempotent approval retries, rejection, invitation acceptance, and typed conflicts.
- [ ] Notification tests cover state-based email behaviour through notification programs where coverage exists or is added.
- [ ] The package typechecks and the relevant workflow/API tests pass.

## Blocked by

- `.scratch/registration-use-case-programs/issues/02-extract-registration-review-decision-acceptance.md`
