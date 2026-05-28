# Clarify Registration Effect provider map composition

Status: ready-for-agent

## Parent

`.scratch/registration-use-case-programs/PRD.md`

## What to build

Align Registration Effect runtime and documentation with the ADR: applications and provider modules choose concrete capability implementations, while Registration use-case programs depend only on provider-independent capabilities.

This is a wiring and architecture cleanup slice, not a provider replacement. The goal is to make it clear where provider maps are composed and to prevent use-case programs from assuming concrete providers such as Commercetools, WorkOS, Resend, SQL clients, or provider payload shapes.

## Acceptance criteria

- [ ] Registration Effect runtime/layer composition clearly chooses concrete implementations for provider-independent capability services.
- [ ] Use-case programs import only provider-independent capabilities and domain types.
- [ ] Provider-specific imports remain in app/provider layer composition or concrete adapter modules.
- [ ] The current Commercetools, WorkOS, Resend, and memory maps remain supported.
- [ ] The architecture supports future provider maps, such as SQL-backed persistence or query adapters, without changing use-case programs.
- [ ] Documentation or comments are updated only where they clarify the provider-map composition rule from the ADR.
- [ ] No broad all-purpose Registration application service is introduced.
- [ ] No stored Registration data migration or provider replacement is included.
- [ ] The package typechecks and the relevant Registration Effect/API tests pass.

## Blocked by

- `.scratch/registration-use-case-programs/issues/01-extract-registration-intake-eligibility-and-query-preflight.md`
- `.scratch/registration-use-case-programs/issues/02-extract-registration-review-decision-acceptance.md`
- `.scratch/registration-use-case-programs/issues/03-thin-workflow-entrypoints-over-registration-programs.md`
