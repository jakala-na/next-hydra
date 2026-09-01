# Run Domain-Collocated Playwright BDD Against Live Compositions

Status: Accepted

## Context

Browser scenarios in this repository can cross the customer Web application, the consumer API, the Admin application, domain programs, and external providers. We need those scenarios to remain readable in domain language, reusable across WorkOS and Clerk, attributable to the packages Turbo evaluates for affectedness, and capable of finding integration failures in the same provider graph the applications actually run.

Per-scenario provider swapping appears flexible, but it moves composition into mutable test state. A server-wide in-memory or file-backed switch cannot safely isolate parallel scenarios, while starting a server for every combination creates a Cartesian product of compositions. Both approaches also allow tests to pass while provider APIs, credentials, serialization, application boundaries, or production Layer wiring are broken.

Component behavior has a different boundary. Rendering disconnected React components does not need the cost or orchestration of a multi-application BDD suite, and translating every Storybook interaction into global Gherkin steps would create a second component-test abstraction to maintain.

## Decision

Use Playwright BDD for browser-level domain behavior and run it against one complete, live workspace composition at a time.

Collocate feature files, step bindings, browser drivers, scenario state, and domain-specific fixtures with the package that owns the behavior. Feature wording uses human-facing domain language. Steps translate that language into thin context and driver calls; they do not reproduce production orchestration. Shared test contracts belong in provider-independent packages only when multiple domains or providers need them. The central Playwright package owns discovery, application routing, process orchestration, and the selection of concrete provider Layers, but does not own domain behavior.

Provision scenario resources through live domain programs and provider adapters. WorkOS and Clerk may use different setup mechanics, but both implement the same provider-independent auth test control so generic steps such as `I log in as` do not depend on either provider. Test contexts track the exact identities, Registrations, Business Units, Customers, invitations, and other ephemeral resources they create and clean them up after the scenario in an order that remains safe after partial failure. Shared environment prerequisites, such as a product catalog needed for checkout, are seeded or repaired separately and are not destroyed by individual scenarios.

Locally, reuse the long-lived `pnpm dev` composition and each application's normal environment files. Portless resolves the worktree-specific Web, API, and Admin origins. In CI, Playwright may own fresh application processes, but each process still receives the environment belonging to that application; Admin and customer identity credentials remain isolated as required by ADR-0008.

Treat domain scope and provider composition as separate dimensions. Tags such as `@auth`, `@registration`, `@commerce`, and `@cms` select behavior owned by a context. A CI composition row selects a complete provider combination supported by the workspace lockfile. Do not generate every possible provider combination, and do not run features for applications or services absent from the selected composition. Workspace dependencies from the runner to applications, domains, and selected providers allow Turbo to decide when the suite is affected.

Use Storybook interaction tests in browser mode for isolated component behavior. Do not use Gherkin as a second component-test authoring layer unless a component exposes domain behavior that genuinely requires the multi-application E2E boundary.

## Considered Options

- **Swap Effect Layers per scenario through feature flags, process memory, or a document store.** Rejected because the switch becomes shared mutable server state, complicates parallel isolation, and stops exercising the real application/provider boundary.
- **Start a separate server for every mocked or live composition.** Rejected because setup cost grows as a Cartesian product and encourages testing combinations that the workspace does not actually support.
- **Mock external providers for the main browser suite.** Rejected as the default because it misses provider API, authentication, serialization, credential, and Layer-composition failures. Focused unit and integration tests may still use test Layers below the browser boundary.
- **Keep all features and steps in the central Playwright package.** Rejected because ownership and vocabulary drift away from the domain, generic steps acquire feature envy, and Turbo loses a useful package-level affectedness signal.
- **Use Playwright BDD for isolated components.** Rejected in favor of Storybook browser tests, which already provide component composition, interaction, and visual context without cross-application orchestration.

## Consequences

The browser suite is intentionally closer to end-to-end testing than to a fast mocked test harness. It costs more, requires isolated provider tenants and deterministic cleanup, and must generate collision-resistant test data. In return, it validates application routing, identity realms, HTTP boundaries, production Effect programs and Layers, and live provider integrations together.

The suite does not promise coverage of every theoretical composition. A provider combination becomes a CI row only when the repository can install, configure, and operate that complete composition. Domain features remain reusable across those rows because provider divergence stays behind test-control contracts and concrete Layers.

This decision extends ADR-0002 and ADR-0003: test adapters remain thin and invoke domain programs through live Layers. It also preserves the Admin/customer identity isolation established by ADR-0008.
