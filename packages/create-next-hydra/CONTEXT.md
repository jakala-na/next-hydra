# Workspace Composition

The Workspace Composition context describes the selectable parts of a Next Hydra workspace and how registry items materialize them.

Customer scaffolding and local composition use one workspace constructor. It owns baseline files, the selected registry graph, package dependency closure, templates, registry transformations, aliases and patches. Scaffolding acquires a source revision in a temporary checkout, constructs copied output, installs dependencies and initializes customer Git. Development composition constructs from canonical local source, links eligible files and applies ownership-aware refresh. There is no clone-and-prune application baseline or separate maintainer scaffold path.

Registry environment defaults are initialization inputs, not refresh-owned files. Named composition seeds missing environment files without changing existing files; `--copy-env` local credential overlays take precedence. Refresh does not merge newly required variables into existing files or retain credential contents/fingerprints in applied state. Both customer and developer task graphs preserve shell environment access, type-check/test build gates, and non-maintainer package commands.

Package manifests own their scripts and tooling dependencies. Portless is included in both Customer and Development Workspaces. Composition adapts only explicitly declared Portless host names and optional application ports; it preserves development scripts and does not infer commands from a Next dependency. Customer hosts and copied URL defaults use a product-neutral project name. Entrypoints importing composed siblings, such as the administration CLI entrypoint, are copied and refreshed together with those siblings so Node resolves them inside the selected workspace.

Named workspaces always initialize or refresh in `workspaces/<name>`. Source linking is the default; `--no-link` selects physical copies with the same ownership-aware lifecycle. Definitions, optional READMEs, app-local `vercel.json` files and derived `tasks/` metadata are workspace-owned settings, not registry output. Those settings and restored caches may precede initialization; arbitrary unowned source and redirected cache roots may not. Copied refresh also refuses unregistered files. Refresh preserves dependency and build caches in place. Customer and named workspaces share task configuration that hashes materialized sources, including links and ignored paths, and selected environment inputs. Host-specific cache placement belongs to the build invocation. Vercel composes and installs during its Install Command, then builds the selected app at that same named path in its Git deployment; no upload workflow is required. Customer creation stays fresh-directory and receipt-free, retaining the registry's existing Vercel defaults and skip-CI scripts without adding maintainer commands. Named composition omits those registry Vercel defaults and preserves its independently authored deployment settings instead.

Named Vercel deployments use Turbo's pre-install affected-task query against the previous successful deployment for the same project and branch. Each named workspace commits a small `tasks/` package, discovered by the outer pnpm workspace, with native Turbo inputs derived by the actual constructor from the selected source closure. There is no separate deployment inventory or custom changed-file matcher. `workspace:sync` derives metadata using disposable staging and lets pnpm synchronize the outer lockfile without installing application dependencies, running lifecycle scripts or copying credentials; `workspace:check` verifies metadata freshness and a frozen offline install in CI. Commit task metadata and the lockfile together. The outer query sees canonical source changes, while the inner application retains the same Turbo configuration as customer output. Missing task registration, invalid metadata, unavailable history, query errors and unresolved external sources allow builds; explicit redeploys remain possible for environment and external-content changes. Detection is conservative at whole-composition/package granularity. Turbo caches compilation and application tasks, not ownership-aware composition itself.

## Language

**Baseline**: The mandatory workspace content included in every composed Next Hydra project and maintained as ordinary canonical starter source. A currently fixed integration remains part of the Baseline until it becomes a Provider Slot. _Avoid_: Default provider, mandatory add-on

**Maintainer Workspace**: The canonical Next Hydra source checkout containing implementation modules, templates and registry ownership. _Avoid_: Customer project, disposable clone

**Development Workspace**: A named, materialized composition with its own dependency graph and safe refresh lifecycle. Ordinary source is linked to the Maintainer Workspace for authoring or copied with `--no-link` for deployment; composed files remain physical. _Avoid_: Customer Workspace, second source of truth

**Workspace Definition**: A version-controlled request for a named Development Workspace, containing its Workspace Selection and optional local development settings. Its stable name identifies its local application hosts and deployment directory. App-local deployment configuration and derived `tasks/` metadata may be committed alongside it; materialized runtime manifests are not part of the definition. _Avoid_: Generated app, application profile, ownership receipt

**Applied Workspace State**: Ignored local ownership and before/after fingerprints used to protect files during Development Workspace refresh and interruption recovery. _Avoid_: Desired selection, backup, customer management contract

**Customer Workspace**: A product-neutral scaffolded workspace after ownership of all materialized code has transferred to its customer. It does not retain the maintainer product name in application-facing identifiers or content, is inspected as it exists, and is not treated as a managed composition. _Avoid_: Maintainer Workspace, managed project

**Reference Composition**: A named Development Workspace used to exercise a representative stack. Its assembled files are not retained in the canonical Maintainer Workspace. It is not an endorsement or automatic customer scaffold default. _Avoid_: Preferred stack, default Provider

**Workspace Selection**: The authoritative desired Provider and Add-on choices in a Workspace Definition. It is not retained as a receipt or management contract in a Customer Workspace. _Avoid_: Scaffold receipt, customer ownership ledger

**Preset**: A reusable, explicit request containing Provider and Add-on choices for a new composition. A Preset references Selection Definitions but does not replace their compatibility declarations or become retained management state in the Customer Workspace. _Avoid_: Default stack, Reference Composition, scaffold receipt

**Provider Slot**: A role in the selected stack filled by a Provider, distinct from a location in a composed file. Its cardinality is constrained by installed packages. _Avoid_: UI slot, package alias

**Slot Cardinality**: The minimum and maximum number of Providers a composition may select for a Provider Slot. Installed packages may require or forbid a role; otherwise it is optional. _Avoid_: Permanent exactly-one invariant

**Provider**: A selectable implementation that fills one Provider Slot and may depend on other registry items. _Avoid_: Provider package, registry item

**Backend App**: An application installed by a Provider, Composition Recipe or Add-on that runs as a separate backend service within the composed workspace. _Avoid_: Sidecar, backend application

**Provider Alias**: The stable workspace package name through which Baseline code imports the Provider selected for one Provider Slot. Each slot defines its own current package interface; a Provider may satisfy part of that interface with an explicit no-op when the capability is validly unnecessary. V1 does not assign independent version numbers to these interfaces. _Avoid_: Concrete Provider package, generated binding module, universal Provider interface

**Provider Binding**: The Provider-owned association between one Provider Alias and that Provider's installable implementation package, including its canonical Maintainer Workspace source when available. _Avoid_: Provider Alias, concrete consumer dependency, compatibility declaration

**Provider Dependency**: A consumer-owned declaration that one workspace package uses the Provider selected for a Provider Slot through that slot's Provider Alias. It does not select or require a concrete Provider. _Avoid_: Compatibility declaration, registry dependency, concrete Provider requirement

**Add-on**: An optional composition selection that may depend on other registry items and is valid only when its compatibility requirements are satisfied by the complete selected stack. _Avoid_: Provider, optional package

**Package**: A complete domain implementation installed as one unit, including its standard functionality and required integrations. _Avoid_: Catalog/cart/checkout feature switches

**Composition Recipe**: A declarative assembly unit that brings files, dependencies or Slot Bindings into a workspace. Recipes may build on other recipes; a package-owned recipe connects participating packages without making the package's standard functionality an independent feature choice. _Avoid_: Contribution, Package Integration, independently selectable subfeature

**Provisioning Recipe**: A provider-specific description of external configuration or content to apply after composition. Including it in a workspace does not apply it to an external service. _Avoid_: Installation hook, Composition Recipe

**Composition Template**: The canonical structure of one materialized file, with named locations for Slot Bindings. Templates may belong to applications or packages; their output is ordinary customer-owned source. _Avoid_: Full-stack template permutation, runtime plugin host

**Module Reference**: A reference to an export from canonical implementation source that a Slot Binding can place in a Composition Template. _Avoid_: Text snippet, executable scaffold hook

**Slot Binding**: The placement of a Module Reference into a named Composition Template location, including its order and optional local name. It belongs to the selected registry item, not a separate customer feature choice. _Avoid_: Contribution, Composition Recipe, Provider Binding

**Selection ID**: The stable, globally scoped identity of a Provider, Package, Composition Recipe, Add-on or Preset, independent of where its materialization content is obtained. _Avoid_: Registry URL, repository path, registry item name

**Selection Definition**: The metadata identifying a Provider, Package, Composition Recipe, Add-on or Preset and its compatibility and package-specific requirements. _Avoid_: Registry catalog entry, Composition Plan

**Selection Definition Schema**: The current JSON Schema for a complete ShadCN registry item containing `meta.nextHydra`. A companion Source Registry schema applies it to Selection Definitions inside colocated registry files while ordinary registry items continue to use ShadCN's schema directly. V1 follows one stable schema URL rather than exposing numbered schema generations. _Avoid_: Registry item schema, Customer Workspace version, Provider package version

**Registry Source**: The canonical source owned by a registry item, including files installed outside their original package. _Avoid_: Contribution Source, materialized application copy, Customer Workspace receipt

**Source Registry**: The catalog of registry items and their Registry Sources, maintained alongside the code it describes. _Avoid_: Generated template tree, Customer Workspace receipt, registry server

**Registry Artifact**: The resolved installable ShadCN representation of a registry item. ShadCN may produce it in memory from a local or public GitHub Source Registry, or a hosted registry may serve equivalent generated JSON. It is not a second checked-in source tree and official v1 does not require persistent generated artifacts. _Avoid_: Canonical source, required build folder, Customer Workspace receipt

**Binary Asset**: A registry-owned file that must be preserved byte-for-byte rather than treated as text. _Avoid_: General file-copy operation, executable hook

**Composition Plan**: The deterministic, validated expansion of a Baseline, selected Providers, and Add-ons into declarative materialization work. It contains no Provider-supplied executable hooks. _Avoid_: Setup script, Provider hook

**Managed Application File**: A package-owned registry file materialized outside its canonical source location, such as a provider-specific route in the web application. A Development Workspace retains its source ownership for safe refresh; a Customer Workspace owns the copied file outright. _Avoid_: Generated adapter, ownership receipt, customer-managed file

**Additive Installation**: A customer-approved materialization that inspects the intact requested registry graph, creates missing targets, skips identical targets, and treats changed targets as explicit conflicts without inferring ownership or removing code. V1 accepts only explicitly targeted exact-copy ShadCN file types so its preview matches the installed content. It checks compatibility visible through the graph and exact known Provider aliases and discloses assumptions that cannot be proven without customer selection state. _Avoid_: Recomposition, synchronization, provider switch, Customer Workspace upgrade

**Compatibility Declaration**: A Provider- or Add-on-owned statement naming the concrete Providers or Add-ons it requires or conflicts with. It must be satisfied before a closed-world composition can be materialized; Workspace Composition validates declarations but does not centrally re-author them. Customer Additive Installation hard-fails observable violations and discloses requirements whose state cannot be proven without a receipt. _Avoid_: Central compatibility matrix, registry dependency
