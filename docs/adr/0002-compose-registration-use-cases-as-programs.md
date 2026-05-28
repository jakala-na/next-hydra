# Compose Registration Use Cases as Programs

Registration use cases are modeled as named Effect programs in `packages/registration/programs/` that compose provider-independent capability services, not as new `Context.Service` classes by default. Entry adapters such as HTTP handlers, workflow entrypoints, server actions, jobs, and tests should stay thin: they decode, authorize, compose live layers, run programs, and map adapter-specific results, while Registration lifecycle policy and provider orchestration live in the programs.

This extends ADR-0001: `Registrations` continues to own only Registration aggregate persistence and lifecycle transitions over versioned storage, while workflow state, retry details, provider payloads, and read-model concerns remain outside the aggregate. Programs may depend on capability services such as `Registrations`, `RegistrationQueries`, `CommerceAccounts`, `IdentityUsers`, `VatValidator`, `RegistrationMarketPolicy`, `Invitations`, and `RegistrationEmails`, but they must not import provider-specific adapters such as Commercetools, WorkOS, Resend, SQL clients, or provider payload shapes. Provider maps are composed in app or provider layer modules by choosing concrete implementations for those capabilities.

## Consequences

Use `Context.Service` for replaceable capabilities supplied by `Layer`; use programs for Registration use cases that order and coordinate those capabilities. Public submission intake, review decision acceptance, onboarding, invitation acceptance, and notifications should be implemented as programs unless a real adapter seam emerges with multiple implementations.
