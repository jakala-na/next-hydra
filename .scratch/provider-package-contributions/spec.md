# Provider and Add-on Composition

Status: accepted

This is the canonical implementation contract for Provider and Add-on composition. The [Wayfinder map](map.md) retains the decision history, and [ADR 0004](../../docs/adr/0004-use-next-hydra-over-shadcn-for-workspace-composition.md) records the architectural choice.

## Scope

Next Hydra composes a mandatory Baseline with exactly one Auth, CMS, and Commerce Provider in v1, plus compatible optional Add-ons. A Provider or Add-on may contribute workspace packages, Backend Apps, provider-native source, application routes, dependencies, safe environment placeholders, and terminal setup instructions.

Runtime switching, automated external-service setup, Composer changes, Drupal module enablement, real-secret collection, and automatic upgrades of customer-modified workspaces are outside v1.

## Source and package contract

- Every selectable Provider, Add-on, and Preset is a standard ShadCN `registry:item` with strict `meta.nextHydra` metadata.
- Registry source remains beside the code it describes. A copied file uses a `~/...` target naming its final path from the consumer workspace root.
- Provider-specific Next.js routes are complete `route.ts` registry files. Next Hydra has no route generator, route manifest, catch-all dispatcher, or method-merging language.
- Baseline applications import Providers through stable aliases: `@repo/auth`, `@repo/cms`, and `@repo/commerce-provider`. The provider-neutral Commerce domain remains `@repo/commerce`.
- A Provider declares one slot `binding.specifier` and may declare `binding.sourcePath` as its workspace-root-relative maintained source directory. Baseline and selected contribution consumers declare a slot, package directory, and dependency section through Provider dependencies; the stable alias is derived from the slot. Maintained Providers receive exact and `/*` direct-source TypeScript paths in every selected consumer. Providers without `sourcePath` rely on pnpm's installed alias and receive no TypeScript path override.
- Standard ShadCN fields own files, root JavaScript dependencies, environment placeholders, CSS, fonts, documentation, and `registryDependencies`. `meta.nextHydra.packages` is used only for an ordinary exact dependency entry in a particular workspace package; stable Provider aliases cannot be repeated there. Typed binary assets and pnpm patches are supported only during maintainer composition and initial scaffolding in v1.

## Resolution and validation

Next Hydra validates the requested selection graph against the source registry before a maintainer switch changes the workspace or a scaffold creates its target. A maintainer switch then prepares the exact artifacts and validates their package.json targets before writing. A scaffold first clones into its already-approved missing or empty target, then repeats resolution against that clone, prepares the exact artifacts, and validates package.json targets before removing or installing composition files.

Composition resolution:

1. Fetches every requested item and recursively fetches every `registryDependency` as an intact item using the invoking workspace's ShadCN registry configuration.
2. Parses all `meta.nextHydra` definitions and resolves the requested Providers, required Add-ons, and Preset selections.
3. Validates Provider Slot cardinality, Selection IDs, `requires` and `conflicts`, exact package requirements, pnpm patches, safe workspace-root paths, and every file and asset target.
4. Rejects two intact registry items that claim the same materialization target before ShadCN flattens the graph.
5. Builds one deterministic Composition Plan and prepares the exact fetched artifacts for installation. Nested references are rewritten to those prepared artifacts, while the invoking registry configuration is also passed to ShadCN.
6. Copies selected typed assets, invokes ShadCN once from the consumer workspace root, then applies package-specific entries, patches, and the final root dependency installation as applicable.

ShadCN remains the registry transport and materialization engine. Next Hydra owns the composition meaning and validates the intact graph before ShadCN's merged-tree behavior can discard metadata or target claims.

## Maintainer Workspace

The ordinary repository checkout is the Maintainer Workspace. `next-hydra.json` records its current Workspace Selection, while all canonical Provider, Add-on, Backend App, and registry source remains available for development.

`create-next-hydra use` validates and shows the complete plan, replaces only known Managed Application Files, updates the Workspace Selection, package requirements, and stable-alias TypeScript paths, and runs `pnpm install`. `use --check` performs the same resolution without writes and fails when a stable-alias path differs from the plan. A failed operation is not rolled back; the CLI reports completed and pending work and leaves the Git diff for inspection or repair.

## Initial scaffold

`create-next-hydra <directory>` requires a missing or empty target. Explicit flags or a portable `--preset` provide every required Provider choice. The CLI validates the requested source selection before creating the target, clones the maintainer repository into that target, completes exact artifact and package.json-target preflight inside the clone, removes all variable contribution targets, reconstructs only the selected graph, updates stable-alias TypeScript paths, removes registry authoring and maintainer-only files, installs dependencies, and initializes Git last.

A failure leaves the partial target intact. A successful Customer Workspace contains materialized customer-owned code and no Workspace Selection, registry authoring source, composition receipt, or dependency on `create-next-hydra`.

## Customer Additive Installation

`create-next-hydra add <item-or-url>` installs one ordinary registry item or Next Hydra Add-on into the workspace as it exists. It does not accept Providers or Presets, remove files, switch a Provider, or claim to upgrade the project.

Before confirmation, it walks the complete intact dependency graph, rejects duplicate target claims, verifies known Provider requirements from exact stable aliases in `apps/web/package.json`, resolves an Add-on's Provider dependencies by copying those exact installed alias specifiers into the declared consumers, reports compatibility requirements that cannot be proven without a customer receipt, and discloses prospective files, dependency entries, and other ShadCN-managed effects. Customer `add` accepts only exact-copy `registry:file` and `registry:item` file entries with explicit targets; it rejects file types that ShadCN would transform because the disclosed source would not be the exact installed content. The exact inspected artifacts are prepared locally and remain the installation input after approval. It creates missing files and skips files ShadCN considers identical after newline and surrounding-whitespace normalization. Changed files or package entries require individual approval or `--overwrite`; `--yes --overwrite` is the intentional fully non-interactive form. Cancellation happens before any write.

Customer `add` rejects typed binary assets and pnpm patches because it cannot transport or safely apply them in v1. All resulting files remain customer-owned.

## Acceptance

- Drupal and Contentstack can each be selected, scaffolded, and recomposed through the same Provider Slot and `@repo/cms` alias.
- Maintainer composition and initial scaffold write direct-source and wildcard TypeScript paths for maintained Providers, leave external Providers to pnpm resolution, and remove catalog-governed aliases from consumers where the selected Provider no longer requires them; `use --check` reports incorrect and stale paths.
- Drupal reconstructs its package, six application routes, Backend App, typed assets, and patches from the selected source-registry graph.
- An example compatible Drupal and Commercetools Add-on fixture materializes frontend and Drupal-module targets; the same fixture request fails before writes with Contentstack selected.
- Customer `add` covers missing, identical, changed, overwrite, cancellation, no-deletion, transitive dependency, and duplicate-target scenarios, and rejects transformed file types or malformed package.json targets before writes.
- `pnpm registry:check`, unit tests, typecheck, build, and `create-next-hydra use --check` pass before release.

## Agreed v1 limitations

- Auth, CMS, and Commerce each have cardinality `1..1`; disabling a slot or selecting multiple Providers requires new application seams.
- Customer workspaces have no authoritative upgrade, restore, or Provider-switch operation.
- Unknown compatibility requirements in a customer-owned workspace can be disclosed but not proven without reintroducing retained composition state.
- Customer `add` does not support ShadCN file types that require framework-aware transforms; authors use exact-copy `registry:file` or `registry:item` entries instead.
- Private registries depend on ShadCN registry configuration and credentials supplied by the invoking workspace; those secrets and mappings are not copied into the scaffold.
- Registry items are declarative and cannot run arbitrary hooks.
