# Provider and Add-on Composition

Type: wayfinder:map
Status: resolved

## Destination

Produce an implementation-ready specification for provider and add-on composition in Next Hydra. Maintainers must be able to select and switch CMS and Commerce providers in developer workspaces without manually juggling provider-specific application files, while `create-next-hydra` governs and provisions the selected workspace composition when scaffolding a project.

A provider selection may contribute a bundle of packages, sidecar applications, provider-native modules or extensions, routes, configuration, and tooling. Optional add-ons may contribute additional workspace units and are available only when their declared CMS, Commerce, and cross-add-on compatibility requirements are satisfied.

The specification is for build-time and development-time composition. Runtime provider switching and a provider-management experience for storefront users are not part of the destination.

## Notes

- This map records the resolved architecture and developer workflow. The canonical specification linked below is the implementation contract; the remaining tickets and research preserve the decision history.
- Developer workspaces are the primary switching use case. Scaffold-time selection is a related consumer of the same provider metadata, not evidence that generated projects need a persistent profile manager.
- A developer-workspace switch may update tracked package manifests and the lockfile and may run `pnpm install`; a zero-diff or install-free switch is not required.
- Materialized source files follow shadcn-style ownership transfer: after the CLI copies them into a project, they are customer-owned code. The CLI must not infer that it may overwrite or delete them, even if their original provider is no longer selected.
- A Maintainer Workspace switch may remove or replace only the application-file targets declared by the source registry, such as Provider-specific Next.js routes. Customer-owned source receives preview, additive installation, and explicit conflict handling instead.
- Repeated provider and add-on switching occurs in the ordinary Maintainer Workspace and may leave a developer-repairable diff when an operation fails. It is not a promise of atomic switching or of reversibly switching an arbitrary scaffolded or customer-modified project.
- A provider is a capability selection, not necessarily one npm package. Its required contributions may include multiple workspace packages, applications, or provider-native extensions.
- An add-on is an optional composition choice. Add-ons may integrate multiple selected providers, such as a Drupal module that integrates Commercetools, and must declare compatibility against the complete selected stack.
- `create-next-hydra` governs the resulting workspace composition, including `apps/*`, `packages/*`, dependencies, and provider-contributed application files; it is not only a package installer. Once materialized into a customer project, those files are customer-owned as described above.
- Preserve the existing asymmetric seams unless research gives a concrete reason to change them: CMS is selected behind stable `@repo/cms/*` imports, while Commerce has a provider-neutral `@repo/commerce` package and app-selected provider Layers.
- Provider-specific routes, configuration, environment requirements, generated artifacts, and tooling are legitimate package contributions. Do not assume every provider has the same contribution shape.
- Use `/research` for external facts and primary-source comparisons. Use `/grilling` and `/domain-modeling` only after the research frontier is resolved, one decision at a time.
- Refer to this map and its tickets by name in user-facing discussion.

## Decisions so far

- [Canonical Provider and Add-on Composition specification](spec.md) — consolidates the accepted v1 behavior, command boundaries, complete registry-graph preflight, customer ownership rules, acceptance criteria, and limitations. The tickets and research below retain the decision history.
- [Generator recipes and provider contributions](issues/01-generator-recipes-and-provider-contributions.md) — `create-better-t-stack` is central and additive rather than reversible; prototype declarative package contributions, centralized validation, idempotent sync/check semantics, and Turbo only as the local runner.
- [Next.js provider contribution constraints](issues/02-next-provider-contribution-constraints.md) — App Router requires application-owned route entries, alias mutation creates tracked churn, and viable local designs narrow to generated adapters or a dispatcher over already-installed provider packages.
- [shadcn CLI and registry exploration](research/shadcn-cli-registry-exploration.md) — use the documented, stable `shadcn/registry` API as the v1 source-contribution engine rather than copying its design or forking its internals. Registry files declare their final workspace-root targets, so `create-next-hydra` can delegate the complete dependency graph, including Provider-specific routes, to one root ShadCN installation. Next Hydra remains responsible for Provider/Add-on compatibility, maintainer-only removal of inactive Provider files, binary assets, and package-specific manifest entries, and may consume local, public GitHub, or authenticated private registries through the same protocol. Raw `shadcn add` remains an incomplete escape hatch for Next Hydra-aware items because it bypasses those rules.
- [ShadCN root targets versus Install Units](research/06-shadcn-root-targets-vs-install-units.md) — records why complete workspace-root targets replaced the discarded per-root installation prototype and where package-specific metadata is still necessary.
- [Whole-provider Add-on customer scenarios](research/05-whole-provider-addon-customer-scenarios.md) — benchmarks the cost of whole-provider registry dependencies and documents the accepted behavior for heavily modified customer workspaces.
- [Provider bundles and add-on compatibility](issues/03-provider-contribution-architecture.md) — compose a mandatory Baseline, cardinality-governed Provider Slots, self-describing Providers, and optional Add-ons; selections own hard concrete-ID compatibility while `create-next-hydra` resolves and validates the complete plan before materialization.
- [Test provider switching](issues/04-provider-contribution-architecture.md) — avoid a shared catch-all route and model each Provider's exact Next.js route files as ordinary ShadCN registry files with final application targets.
- [Decide how providers and add-ons plug in](issues/05-scaffold-time-provider-provisioning.md) — keep canonical integration source in the maintainer repository, select Auth, CMS, and Commerce implementations through stable package aliases, keep cross-application files in Provider-local registry source, and give customers selected ShadCN-owned source without a receipt or management contract.
- [Scaffold-time stack provisioning](issues/06-scaffold-time-stack-provisioning.md) — validate explicit selections before writing, reduce the cloned maintainer source to the Baseline, install only selected registry contributions, leave failures intact, and keep secrets and external provider activation outside automatic provisioning.
- [Provider and registry version compatibility](issues/07-provider-and-registry-version-compatibility.md) — follow ShadCN's current-schema and address model, keep Selection IDs and Provider Alias contracts unversioned in v1, and treat customer `add` as installation rather than project upgrade.
- [Implementation sequence and specification handoff](issues/08-implementation-sequence-and-specification-handoff.md) — deliver four runnable end-to-end slices beginning with complete Drupal and Contentstack maintainer switching and scaffolding; use colocated ShadCN GitHub source registries, keep one deep composition planner, and release no partial provider-selection workflow.

## Not yet specified

- None currently.

## Out of scope

- Runtime CMS or Commerce provider switching in a deployed storefront.
- A provider-selection interface for storefront visitors, editors, or other final users.
- Implementing a second production Commerce provider as part of this effort.
- Redesigning CMS rendering, Commerce domain Services, or provider behavior unrelated to package selection and application contributions.
