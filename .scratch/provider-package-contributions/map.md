# Provider and Add-on Composition

Type: wayfinder:map
Status: resolved

## Destination

Produce an implementation-ready specification for provider and add-on composition in Next Hydra. Maintainers must be able to select and switch CMS and Commerce providers in developer workspaces without manually juggling provider-specific application files, while `create-next-hydra` governs and provisions the selected workspace composition when scaffolding a project.

A provider selection may contribute a bundle of packages, sidecar applications, provider-native modules or extensions, routes, configuration, and tooling. Optional add-ons may contribute additional workspace units and are available only when their declared CMS, Commerce, and cross-add-on compatibility requirements are satisfied.

The specification is for build-time and development-time composition. Runtime provider switching and a provider-management experience for storefront users are not part of the destination.

## Notes

- This is a planning map. Resolve the architecture and developer workflow; do not implement the provider system until the specification is complete.
- Developer workspaces are the primary switching use case. Scaffold-time selection is a related consumer of the same provider metadata, not evidence that generated projects need a persistent profile manager.
- A developer-workspace switch may update tracked package manifests and the lockfile and may run `pnpm install`; a zero-diff or install-free switch is not required.
- Materialized source files follow shadcn-style ownership transfer: after the CLI copies them into a project, they are customer-owned code. The CLI must not infer that it may overwrite or delete them, even if their original provider is no longer selected.
- Destructive regeneration is permitted only for Generated Adapters explicitly identified as derived output inside the Maintainer Workspace. Existing project source receives dry-run/diff, additive generation, and explicit conflict handling by default.
- Repeated provider and add-on switching occurs in the ordinary Maintainer Workspace and may leave a developer-repairable diff when an operation fails. It is not a promise of atomic switching or of reversibly switching an arbitrary scaffolded or customer-modified project.
- A provider is a capability selection, not necessarily one npm package. Its required contributions may include multiple workspace packages, applications, or provider-native extensions.
- An add-on is an optional composition choice. Add-ons may integrate multiple selected providers, such as a Drupal module that integrates Commercetools, and must declare compatibility against the complete selected stack.
- `create-next-hydra` governs the resulting workspace composition, including `apps/*`, `packages/*`, dependencies, and provider-contributed application files; it is not only a package installer. Once materialized into a customer project, those files are customer-owned as described above.
- Preserve the existing asymmetric seams unless research gives a concrete reason to change them: CMS is selected behind stable `@repo/cms/*` imports, while Commerce has a provider-neutral `@repo/commerce` package and app-selected provider Layers.
- Provider-specific routes, configuration, environment requirements, generated artifacts, and tooling are legitimate package contributions. Do not assume every provider has the same contribution shape.
- Use `/research` for external facts and primary-source comparisons. Use `/grilling` and `/domain-modeling` only after the research frontier is resolved, one decision at a time.
- Refer to this map and its tickets by name in user-facing discussion.

## Decisions so far

- [Generator recipes and provider contributions](issues/01-generator-recipes-and-provider-contributions.md) — `create-better-t-stack` is central and additive rather than reversible; prototype declarative package contributions, centralized validation, idempotent sync/check semantics, and Turbo only as the local runner.
- [Next.js provider contribution constraints](issues/02-next-provider-contribution-constraints.md) — App Router requires application-owned route entries, alias mutation creates tracked churn, and viable local designs narrow to generated adapters or a dispatcher over already-installed provider packages.
- [shadcn CLI and registry exploration](research/shadcn-cli-registry-exploration.md) — use the documented, stable `shadcn/registry` API as the v1 source-contribution engine rather than copying its design or forking its internals. `create-next-hydra` remains a thin provider/add-on compatibility and per-root orchestration wrapper; it dispatches universal `registry:item` install units, owns only unavoidable typed manifest patches, and may consume local, public GitHub, or authenticated private registries through the same protocol. Raw `shadcn add` remains an inspection or escape-hatch workflow because it cannot enforce Next Hydra compatibility or route npm dependencies across unrelated workspace roots.
- [Provider bundles and add-on compatibility](issues/03-provider-contribution-architecture.md) — compose a mandatory Baseline, cardinality-governed Provider Slots, self-describing Providers, and optional Add-ons; selections own hard concrete-ID compatibility while `create-next-hydra` resolves and validates the complete plan before materialization.
- [Test provider switching](issues/04-provider-contribution-architecture.md) — generate each provider's exact Next.js routes in the maintainer repository, avoid a shared catch-all route, and use ShadCN to copy files after Next Hydra checks the planned changes.
- [Decide how providers and add-ons plug in](issues/05-scaffold-time-provider-provisioning.md) — keep canonical integration source in the maintainer repository, select Auth, CMS, and Commerce implementations through stable package aliases, generate only fixed provider routes, and give customers selected ShadCN-owned source without a receipt or management contract.
- [Scaffold-time stack provisioning](issues/06-scaffold-time-stack-provisioning.md) — validate explicit selections before writing, reduce the cloned maintainer source to the Baseline, install only selected registry contributions and generated routes, leave failures intact, and keep secrets and external provider activation outside automatic provisioning.
- [Provider and registry version compatibility](issues/07-provider-and-registry-version-compatibility.md) — follow ShadCN's current-schema and address model, keep Selection IDs and Provider Alias contracts unversioned in v1, and treat customer `add` as installation rather than project upgrade.
- [Implementation sequence and specification handoff](issues/08-implementation-sequence-and-specification-handoff.md) — deliver four runnable end-to-end slices beginning with complete Drupal and Contentstack maintainer switching and scaffolding; use colocated ShadCN GitHub source registries, keep one deep composition planner, and release no partial provider-selection workflow.

## Not yet specified

- None currently.

## Out of scope

- Runtime CMS or Commerce provider switching in a deployed storefront.
- A provider-selection interface for storefront visitors, editors, or other final users.
- Implementing a second production Commerce provider as part of this effort.
- Redesigning CMS rendering, Commerce domain Services, or provider behavior unrelated to package selection and application contributions.
