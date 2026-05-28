# Registration Use-Case Programs PRD

Status: ready-for-agent

## Problem Statement

The Registration Effect implementation has clear capability services for persistence, queries, identity, Commerce, invitations, VAT, market policy, and email delivery, but some Registration use-case orchestration is still embedded inside entry adapters. The HTTP adapter currently owns Registration submission policy, duplicate email preflight checks, provider lookup ordering, workflow handoff, search filtering, and transport error mapping in one place.

This makes it harder to understand which module owns which level of behaviour. It also makes reusable Registration behaviour depend on HTTP even when a caller could use local Effect layers directly. The team wants the Registration context to keep provider-specific assumptions out of domain programs while making use-case policy testable without crossing transport seams.

## Solution

Refactor Registration Effect so use cases are named Effect programs that compose provider-independent capability services. Entry adapters such as HTTP handlers, workflow entrypoints, server actions, jobs, and tests should stay thin: they decode input, extract adapter-specific authorization, compose live layers, run programs, and map outputs/errors to adapter-specific responses.

Capability services remain the replaceable seams supplied by Layers. Programs own the ordering and policy of capability calls. Provider-specific assumptions remain in app/provider layer composition and concrete adapters, not in Registration use-case programs.

The first implementation should extract public Registration intake and eligibility behaviour from the HTTP adapter. Additional candidates include review decision acceptance, query/read-model behaviour, onboarding, invitation acceptance, and notifications.

## User Stories

1. As a product engineer, I want Registration use cases to live in named Effect programs, so that I can understand lifecycle policy without reading HTTP handlers.
2. As a product engineer, I want HTTP handlers to stay transport-focused, so that request/response details do not obscure Registration behaviour.
3. As a product engineer, I want workflow entrypoints to call Registration programs, so that workflow code coordinates steps without owning domain policy.
4. As a product engineer, I want server actions to call Registration programs or HTTP adapters intentionally, so that local and remote seams are explicit.
5. As a product engineer, I want capability services to remain provider-independent, so that Registration programs do not assume Commercetools, WorkOS, Resend, SQL, or any other concrete provider.
6. As a product engineer, I want provider maps to be composed in app/provider layer modules, so that different storage/query/provider implementations can be selected without changing use-case programs.
7. As a product engineer, I want public Registration intake extracted from HTTP, so that submission rules can be tested without constructing an HTTP handler.
8. As a product engineer, I want Registration eligibility checks extracted from HTTP, so that duplicate email, Commerce customer, identity user, country, and VAT rules have one local owner.
9. As a product engineer, I want Registration eligibility to compose capability services, so that each provider lookup can vary behind its capability seam.
10. As a product engineer, I want provider failures in eligibility checks to have intentional semantics, so that defects and validation failures are not accidentally conflated.
11. As a product engineer, I want Registration intake to create an awaiting approval Registration only after eligibility passes, so that invalid company requests do not enter the Registration lifecycle.
12. As a product engineer, I want workflow start to remain outside the Registration aggregate, so that workflow metadata and retry state do not leak into persistent Registration state.
13. As a product engineer, I want public Registration intake to optionally depend on a small workflow capability when the entrypoint requires asynchronous review, so that local callers do not cross HTTP unnecessarily.
14. As a product engineer, I want review decision acceptance to be a candidate program, so that marking approval processing and resuming workflow can be tested through one use-case surface.
15. As a registration reviewer, I want approve/reject requests to fail before workflow resume when the Registration transition conflicts, so that workflow does not process impossible decisions.
16. As a registration reviewer, I want accepted review decisions to move the Registration out of the awaiting approval list, so that admin views reflect in-progress decisions.
17. As a product engineer, I want Registration onboarding to remain the program for executing accepted decisions, so that Commerce provisioning, owner invitation issuance, and final approval/rejection stay behind a workflow-called use case.
18. As a product engineer, I want Registration notifications to remain a state-reading side-effect program, so that email orchestration does not decide lifecycle transitions.
19. As a product engineer, I want Registration queries to own read-model semantics, so that list, cursor, search, and query-only predicates do not leak into HTTP.
20. As an administrator, I want Registration list search and pagination semantics to be consistent, so that matching Registrations are not hidden by transport-layer post-filtering.
21. As a product engineer, I want pending email existence to be a query/read-model capability, so that intake eligibility does not manually page through Registration lists.
22. As a product engineer, I want `Registrations` to continue owning only aggregate persistence and lifecycle transitions, so that ADR-0001 remains intact.
23. As a product engineer, I want Registration programs to use existing capability services, so that memory layers remain useful for isolated tests.
24. As a product engineer, I want tests to exercise program interfaces directly, so that the test surface matches production use-case behaviour.
25. As a product engineer, I want route tests to focus on HTTP mapping, so that transport tests do not duplicate all Registration policy tests.
26. As a product engineer, I want workflow tests to focus on workflow sequencing, so that they do not become the only validation of Registration policy.
27. As a product engineer, I want use-case programs to return typed success and failure values, so that adapters can map errors deliberately.
28. As a product engineer, I want program names to reflect Registration language, so that future maintainers do not confuse submission intake, review acceptance, onboarding, queries, notifications, and aggregate persistence.
29. As a product engineer, I want future provider adapters to satisfy capability services, so that a SQL map, Commercetools map, and memory map can coexist.
30. As a product engineer, I want the architecture map and ADR to guide implementation, so that future agents do not reintroduce broad adapter-owned programs.

## Implementation Decisions

- Follow the ADR: Registration use cases are named Effect programs that compose provider-independent capability services, not new capability services by default.
- Use `Context.Service` for replaceable capabilities supplied by `Layer`.
- Use programs for Registration use cases that order and coordinate capabilities.
- Apply this rule to all entrypoints/adapters, including HTTP handlers, workflow entrypoints, server actions, jobs, and tests.
- Keep entry adapters thin. They may decode/encode, extract adapter-specific auth, compose live layers, run programs, revalidate caches, and map errors/statuses.
- Keep provider-specific imports and payload shapes out of Registration use-case programs.
- Compose provider maps in app or provider layer modules by choosing concrete implementations for capability services.
- Preserve ADR-0001: `Registrations` owns Registration aggregate persistence and lifecycle transitions over versioned storage.
- Do not move workflow metadata, retry details, provider payloads, or read-model denormalizations into the Registration aggregate.
- Extract public Registration intake from the HTTP adapter into a program.
- Extract Registration eligibility policy from the HTTP adapter into a program or helper module used by intake.
- Eligibility should compose provider-independent capabilities for pending Registration email lookup, Commerce customer lookup, identity user lookup, country support, and VAT validity.
- Public intake should convert external submission input into Registration details, run eligibility, create an awaiting approval Registration, and expose a typed result.
- Workflow start/resume should be represented as an edge capability only when the use case requires asynchronous processing.
- Local use cases that do not need workflow should not cross HTTP only to access workflow.
- Review decision acceptance should be considered a follow-up extraction: mark approval/rejection processing and resume workflow from one program.
- Registration onboarding remains the workflow-called use case that provisions Commerce, issues owner invitations, and finalizes approved/rejected Registration state.
- Registration notifications remain state-reading side-effect programs that send emails for the relevant Registration state.
- Registration queries should own read-model behaviours such as list, cursor, search, and pending email existence.
- Provider maps should allow different combinations, such as Commercetools custom objects, a key-value store implementation, SQL-backed persistence, and memory layers.
- Program names should avoid implying a new capability service unless a real adapter seam exists.
- If a use case later needs multiple implementations, then introduce a capability service at that point.
- Avoid making one broad Registration application service that owns every use case; keep programs named around coherent Registration lifecycle actions.
- Keep error mapping at the adapter edge, but keep use-case failure reasons typed and explicit enough for adapters to map them.

## Testing Decisions

- Good tests should target externally observable behaviour at the program interface, not private helper ordering or implementation details.
- Program tests should use memory/test layers for capability services so they can run without provider adapters.
- Intake tests should cover successful awaiting approval creation, duplicate pending Registration email, existing Commerce customer email, existing identity user email, invalid VAT, unsupported country, multiple validation reasons, and provider lookup failure semantics.
- Intake tests should verify workflow start behaviour only when testing the workflow-enabled entry/use case.
- Eligibility tests should cover rule aggregation and provider-independent failure behaviour.
- Route tests should become thinner and focus on HTTP schema decoding, auth/header handling, response status mapping, and confirming the handler calls the program path.
- Review decision acceptance tests should cover transition conflict before workflow resume, approval/rejection processing state, idempotent accepted processing where applicable, and workflow resume payload shape.
- Query tests should cover cursor/search/list semantics and pending email existence without relying on HTTP post-filtering.
- Onboarding tests should continue covering Commerce provisioning, invitation issuance, idempotent approval retries, rejection, invitation acceptance, and typed conflicts.
- Notification tests should cover state-based email sending through the notification program, not through HTTP.
- Prior art exists in Registration service tests, Registration query tests, onboarding program tests, and REST route tests.
- Tests should continue using Effect-native test style and Effect layers.

## Out of Scope

- Replacing provider adapters.
- Migrating stored Registration data.
- Changing the Registration aggregate schema beyond what is required by the program extraction.
- Moving workflow state into Registration persistence.
- Replacing HTTP with direct local calls for actions that must execute in the API app.
- Introducing a broad all-purpose Registration service.
- Reworking CommerceAccount domain shape or reopening whether it is provider-independent.
- Implementing SQL-backed storage or query adapters.
- Changing public REST contracts unless extraction exposes an existing inconsistency that must be fixed.
- Rewriting the older non-Effect Registration package.

## Further Notes

- The architecture map is available as a scratch artifact for implementation planning.
- The current ADR clarifies the distinction between capability services and use-case programs.
- The first useful implementation slice is likely public Registration intake plus eligibility extraction, because that removes the most policy from the HTTP adapter while keeping the external API stable.
- Review decision acceptance is a strong second slice if the team wants approve/reject HTTP handlers to follow the same pattern immediately.
- Query/read-model improvements may be needed to avoid transport-layer search filtering and recursive duplicate-email scans.
