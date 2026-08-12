# Implementation sequence and specification handoff

Type: grilling
Status: resolved
Blocked by: 07

## Question

How should the resolved Provider and Add-on Composition architecture be organized into an implementation-ready specification and delivered through a safe, dependency-ordered migration of the current repository?

Decide the smallest independently verifiable phases for the Selection Definition schema, registry artifact build, Composition Plan resolver and validator, Maintainer Workspace selection and switching, stable Auth and Commerce Provider Aliases, generated routes, scaffold-time trimming and installation, Presets, customer `add`, and the CI composition matrix. Identify the first useful vertical slice, the acceptance evidence for each phase, which existing prototype ideas are retained or discarded, and what must ship together to avoid exposing a partially governed customer workflow.

## Comments

- Agreed implementation shape: use runnable end-to-end slices rather than treating schema, planning, artifact building, and scaffold materialization as separate architectural phases. Those internals may be delivered as small commits inside a slice, but every slice ends with CLI-observable behavior and an end-to-end acceptance test.
- Agreed slice one, CMS composition end to end: the CLI switches the Maintainer Workspace and scaffolds a new workspace with either Drupal or Contentstack while Auth and Commerce remain fixed Baseline choices. This slice includes the strict Selection Definition schema, real CMS definitions, deterministic Composition Plan resolution, exact generated routes, the `@repo/cms` alias, a standard ShadCN source registry with package-colocated manifests, clone trimming and materialization, dependency installation, failure reporting, and no-write checks. Drupal proves multiple root-scoped Install Units through `packages/cms-drupal` and `apps/drupal-hydra`; Contentstack proves the simpler single-package shape. The checkpoint scaffolds both CMS variants into empty directories, verifies that inactive CMS source and registry authoring material are absent, installs dependencies, and typechecks the resulting web applications.
- Agreed scaffold completeness test: after cloning the Maintainer Workspace, scaffolding removes every variable CMS contribution, including the selected one, before reinstalling the selected source-registry items through ShadCN. The resulting Drupal or Contentstack workspace must therefore be reconstructible from the Baseline plus its selected items; canonical source left in the clone cannot mask a missing registry file declaration.
- Agreed trim inventory: the scaffold derives variable Provider and Add-on removal paths from the union of resolved targets declared by all source-registry items instead of maintaining a second handwritten list of integration files. The existing explicit scaffold cleanup list remains responsible only for maintainer-only material such as `.git`, documentation applications, the generator package, Workspace Selection, and registry-authoring files. Trimming operates only on the fresh requested scaffold target, never as a Customer Workspace removal mechanism.
- Agreed command boundary: `create-next-hydra use --cms <selection>` changes the active composition only in a Maintainer Workspace, while `create-next-hydra <directory> --cms <selection>` scaffolds a new Customer Workspace into a missing or empty directory. The commands share Composition Plan resolution but have different materialization policies. The later `add` command remains separate because it operates additively on customer-owned code.
- Agreed Maintainer Workspace marker: a checked-in root `next-hydra.json` records the active Workspace Selection and is the marker that permits the `use` command to operate. Initial scaffolding removes this file together with registry-authoring material, so it never becomes a Customer Workspace receipt or management contract.
- Agreed selection-file scope: `next-hydra.json` contains only Provider-slot and Add-on selection references. Official shorthand resolves through the maintainer's local catalog, while ShadCN-supported URLs and local JSON paths permit private and locally developed selections without adding them to the public catalog. The referenced Selection Definition supplies the stable Selection ID and compatibility metadata; the Workspace Selection does not duplicate it.
- Agreed `use` execution: an explicit `create-next-hydra use --cms <selection>` is non-interactive. It resolves and validates the complete plan before writes, prints the planned changes, updates `next-hydra.json`, package aliases and requirements, and exact generated routes, then runs `pnpm install`. It makes no rollback promise and leaves a failed operation's diff in place with a precise report. `create-next-hydra use --check` performs the same resolution without writes or installation and exits unsuccessfully when the committed Maintainer Workspace differs from the plan.
- Corrected ShadCN registry flow: v1 uses a standard root `registry.json` that includes `registry.json` files colocated beside the package or application source they describe. Current ShadCN can install items directly from a public GitHub source registry and can load local included registries for tests, so official Next Hydra does not build, check in, or host a second folder of content-inlined item JSON. Generated static items remain an optional deployment form for a future hosted or authenticated registry, not an architectural requirement and not an input to `use`.
- Agreed slice two, govern Auth and Commerce end to end: Baseline application code moves from concrete `@repo/auth-workos/*` imports to `@repo/auth/*` and from concrete `@repo/commerce-commercetools/*` imports to `@repo/commerce-provider/*`; provider-neutral `@repo/commerce/*` remains unchanged. The same maintainer and scaffold commands gain all three explicit Provider Slots, plus the WorkOS and Commercetools Selection Definitions and source-registry items. The checkpoint scaffolds and checks complete explicit stacks and proves that Baseline code no longer imports concrete Provider packages. Clerk remains unselectable until it satisfies the complete Auth alias and passes the composition checks.
- Agreed slice three, Add-ons and Presets end to end: the planner, maintainer command, and scaffold command gain compatibility-aware and transitive Add-on selection plus `--add-on` and `--preset`. Realistic contract fixtures prove a Drupal-and-Commercetools Add-on with separate frontend and Drupal-module Install Units without publishing fake production integration choices. The checkpoint materializes a compatible Add-on through the CLI and proves that an incompatible request fails before any workspace writes.
- Agreed slice four, Customer Workspace `add` end to end: the on-demand command inspects the workspace as it exists, shows proposed changes, creates missing files, skips identical files, treats changed files as explicit conflicts, and never deletes customer code. Its checkpoint exercises create, skip, conflict, cancellation, and no-deletion scenarios against customer-shaped modified workspaces.

## Slice one implementation handoff

Slice one is one end-to-end CMS delivery. The steps below are implementation order inside the slice, not separately releasable architecture phases.

### 1. Define the source registry and selection state

- Add a standard root `registry.json` whose `include` entries point to `registry.json` files beside `packages/cms-drupal/package.json`, `packages/cms-contentstack/package.json`, and `apps/drupal-hydra/package.json`.
- Put the Drupal and Contentstack Selection Definitions in their primary package registry entries. Drupal references the Drupal application as its second root-scoped Install Unit.
- Add the current Next Hydra JSON Schema for `meta.nextHydra` and use the same shape for runtime validation after ShadCN validates the surrounding registry item.
- Add root `next-hydra.json` with the Reference Composition's CMS selection.
- Move `shadcn` from a development-only dependency to a runtime dependency of `create-next-hydra`, because the published CLI imports its documented registry APIs.

Checkpoint: the CLI test suite loads the real included source registry with `loadRegistry`, loads both complete CMS items with `loadRegistryItem`, validates their Next Hydra metadata, and proves that every declared source file and explicit target resolves.

### 2. Resolve a deterministic CMS plan

- Implement one composition-planning module whose external interface accepts a Workspace Selection plus resolved Selection Definitions and returns either a complete Composition Plan or typed validation failures.
- Keep schema parsing, Provider Slot cardinality, Selection ID checks, Install Unit expansion, package-alias requirements, exact route claims, duplicate path-and-method detection, and deterministic ordering inside that module.
- Include both the selected materialization work and the catalog-wide variable target inventory needed by a fresh scaffold. Do not perform filesystem writes, invoke ShadCN installation, or run `pnpm` while planning.
- Use the real Drupal six-route and Contentstack two-route definitions in tests. Add focused fixtures only for invalid metadata and route collisions.

Checkpoint: unit tests snapshot or compare the complete Drupal and Contentstack plans, prove stable ordering, and prove that invalid cardinality, missing definitions, unsafe targets, and duplicate normalized path-and-method claims fail before writes.

### 3. Deliver maintainer `use`

- Add the `use` subcommand without changing the existing default scaffold command.
- Require root `next-hydra.json`; absence means this is not a Maintainer Workspace.
- `use --cms <selection>` resolves and prints the plan, then updates the Workspace Selection, the `apps/web` `@repo/cms` alias, the exact generated route files, and the lockfile through `pnpm install`.
- Generate route files only from declarative path, method, module, and export mappings. Delete or replace only route targets in the catalog-wide generated-route inventory; all canonical Provider and sidecar source remains present.
- `use --check` resolves the checked-in selection, compares expected aliases and generated routes with the workspace, performs no writes or install, and exits nonzero on drift.
- A write or install failure stops further work, reports completed and pending operations, and leaves the workspace diff intact.

Checkpoint: integration tests run `Drupal -> Contentstack -> Drupal` in a temporary Maintainer Workspace, verify the alias and exact route set after each command, and exercise `--check` for both a matching workspace and deliberate drift.

### 4. Extend the scaffold command through the same plan

- Add interactive CMS selection and `--cms <selection>` to the existing create command while Auth and Commerce remain fixed Baseline integrations in this slice.
- Resolve and validate the selected CMS before the requested target receives any writes.
- Clone the starter into the requested missing or empty directory, remove the complete catalog-wide CMS target inventory, and install only the selected CMS Install Units through the documented ShadCN registry API.
- Apply the selected `@repo/cms` alias and generated routes, remove `next-hydra.json`, the source registry manifests, inactive Provider source, the generator package, and other existing maintainer-only paths, then run the root `pnpm install`.
- Initialize Git and attempt the initial commit only after the composed workspace is complete.
- Remove the current automatic deletion of a newly created target after clone failure. Every failure reports the target, failed step, completed work, and work not attempted and leaves the target exactly as it stands.

Checkpoint: end-to-end tests scaffold both CMS selections from the real local repository, not a hand-built substitute template. Each test verifies the selected package and sidecar presence, inactive CMS absence, alias, exact routes, lack of registry and Workspace Selection files, successful dependency installation, and web typecheck. A forced failure verifies that the partial target remains inspectable.

### 5. Required slice-one commands

The implementation adds a real test script to `create-next-hydra`; the package currently has no tests. Slice one is complete only when these commands pass:

```bash
pnpm --filter create-next-hydra typecheck
pnpm --filter create-next-hydra test
pnpm --filter create-next-hydra build
node packages/create-next-hydra/dist/cli.js use --check
pnpm --filter create-next-hydra test:e2e
```

The end-to-end test command owns its disposable fixture directories. The product CLI itself continues to preserve a failed scaffold target.

## Prototype disposition

Retain the prototype's deterministic planning, exact generated route files, path-and-method collision detection, root-scoped Install Units, stable package-alias changes, and use of the documented `shadcn/registry` interface. Reuse the real Drupal and Contentstack route cases as production acceptance scenarios.

Do not promote the prototype's `.mjs` implementation into production, its catch-all dispatcher alternative, rollback and manifest-restoration behavior, plan digest, destructive customer switching, or fake Commerce Provider and fake Add-on as supported selections. Later Add-on tests may adapt their shapes as fixtures without publishing them.

## Slice-one release boundary

The registry schema, CMS definitions, planner, `use`, scaffold composition, failure behavior, and end-to-end tests ship together. Intermediate commits may be independently reviewed and unit-tested, but the CMS selection flags are not released from a branch that cannot produce and verify complete Drupal and Contentstack Customer Workspaces.

## Implementation evidence

Implemented in `packages/create-next-hydra` and the colocated root, Provider-package, and sidecar source registries. The delivered CLI includes all four slices: complete CMS scaffolding, Auth and Commerce aliases, compatibility-aware Add-ons and portable Presets, and additive customer `add` behavior. The test suite exercises both CMS choices, the Reference Composition drift check, a realistic two-root Drupal and Commercetools Add-on, incompatible preflight before destination writes, local external selections, binary asset integrity, customer file conflicts, and preserved failed scaffolds.

Validation commands:

```bash
pnpm --filter create-next-hydra typecheck
pnpm --filter create-next-hydra test
pnpm --filter create-next-hydra build
node packages/create-next-hydra/dist/cli.js use --check
pnpm --filter create-next-hydra test:e2e
pnpm registry:check
```

## Answer

Implement Provider and Add-on Composition as four runnable end-to-end slices rather than as horizontal schema, registry, planner, and CLI phases. Internal modules and small commits may be delivered in dependency order, but each slice finishes with CLI-observable behavior against a real workspace.

Slice one delivers CMS composition completely. A standard root ShadCN `registry.json` includes registry fragments beside the Drupal package, Drupal application, and Contentstack package. No second template tree or checked-in generated registry output is introduced. One composition-planning module validates Selection Definitions, resolves the selected CMS and its Install Units, produces package-alias and exact route work, rejects conflicts, and supplies the fresh-scaffold target inventory. `create-next-hydra use --cms <selection>` changes only the Maintainer Workspace and `use --check` detects drift without writing. The existing create command gains CMS selection and reconstructs either CMS from the Baseline through the source registry. Both CMS scaffolds install and typecheck, and failed scaffold targets remain intact.

Slice two extends that already-runnable path to Auth and Commerce. Baseline imports move behind `@repo/auth` and `@repo/commerce-provider`, while `@repo/commerce` stays provider-neutral. WorkOS and Commercetools ship with their aliases, definitions, source-registry items, maintainer selection, scaffold support, and end-to-end checks. Clerk is not advertised until it implements the full Auth alias contract.

Slice three extends the same commands with compatibility-aware Add-ons and portable Presets. Realistic fixtures prove transitive requirements, multiple root-scoped Install Units, compatible materialization, and pre-write rejection without publishing fake integrations. Slice four delivers customer `add` as a separate additive workflow that operates on current paths and contents rather than a receipt: it creates missing files, skips identical files, makes changed files explicit, and never deletes customer code.

The implementation retains the prototype's deterministic planning, generated exact routes, path-and-method collision rules, root-scoped Install Units, package aliases, and documented ShadCN APIs. It discards the catch-all dispatcher, prototype `.mjs` code, rollback behavior, plan digest, destructive customer switching, and fake selections as production features. Each slice owns its end-to-end tests; a broader composition-matrix optimization policy is intentionally deferred until enough real Providers exist to make that decision useful.
