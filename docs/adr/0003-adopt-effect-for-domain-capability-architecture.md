# Adopt Effect for Domain and Capability Architecture

Status: Accepted

## Context

This repository is intended to support multiple providers while keeping business logic expressed in domain modules rather than spread across application adapters, provider SDK calls, RPC handlers, form actions, and storage implementations. We need a standard way to model domain data, typed failures, use-case orchestration, replaceable capabilities, provider wiring, resource lifecycles, telemetry, tests, and HTTP boundaries without stitching together unrelated libraries or adding a separate dependency injection container.

The earlier Registration implementation using ORPC, better-result, Zod, and React Hook Form was a useful step toward end-to-end type safety and explicit error modeling. ORPC gives a good RPC-oriented interface, and better-result makes expected failures visible. However, that stack does not provide the same composition model as Effect: especially the typed environment, `Context.Service` capabilities, `Layer` composition, and Effect-native testing/runtime ergonomics that let domain modules remain provider-independent while applications choose concrete infrastructure.

Registration is the first proof of value for this architecture. It should not be treated as a special one-off package. It is the first slice of the repository-wide direction.

## Decision

Adopt Effect as the default architecture for domain modules and provider capability composition across the repository.

Use Effect programs for use cases that coordinate business behavior. Use `Context.Service` interfaces for replaceable capabilities. Use `Layer` to compose provider maps at application or provider boundaries. Use Effect Schema and tagged errors for domain data and expected failures where those values cross module or adapter seams.

Adapters such as HTTP handlers, workflow entrypoints, server actions, jobs, and tests should stay thin. They decode adapter input, authorize, compose the live layer map, run programs or capabilities, and map results into adapter-specific responses. They should not own domain policy.

HTTP remains the seam when calls cross app boundaries. When code is in the same process and can be supplied the needed layers, it should call local Effect programs or capabilities instead of crossing HTTP for convenience.

## Consequences

New domain architecture should be Effect-first. Existing modules can migrate incrementally; there is no repository-wide flag day.

Registration becomes the first migrated slice. The parallel Effect implementation is promoted to the Registration module, and the older ORPC/better-result Registration package is retired rather than carried forward as a second architecture.

Provider integrations should expose provider-independent capabilities where domain code needs them. Provider-specific SDKs, payload shapes, retry details, and storage mechanics belong behind concrete layers in app or provider modules.

ORPC and better-result are not the target architecture for new domain modules. They may remain in unrelated legacy code until those modules are intentionally migrated, but new use-case and capability work should not add more seams in that style.

This decision extends ADR-0002. ADR-0002 describes how Registration use cases compose capabilities as programs; this ADR makes that pattern the repo-level direction.
