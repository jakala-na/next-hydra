# Workspace Composition

The Workspace Composition context describes the selectable parts of a Next Hydra workspace and how registry items materialize them.

## Language

**Baseline**:
The mandatory workspace content included in every composed Next Hydra project and maintained as ordinary canonical starter source. A currently fixed integration remains part of the Baseline until it becomes a Provider Slot.
_Avoid_: Default provider, mandatory add-on

**Maintainer Workspace**:
The canonical Next Hydra source workspace in which Contribution Sources are authored and a selected stack can be recomposed for development.
_Avoid_: Customer project, disposable clone

**Customer Workspace**:
A scaffolded workspace after ownership of all materialized code has transferred to its customer. It is inspected as it exists and is not treated as a managed composition.
_Avoid_: Maintainer Workspace, managed project

**Reference Composition**:
The selected stack that keeps the canonical Maintainer Workspace runnable and reviewable. It is not an endorsement or automatic scaffold default.
_Avoid_: Preferred stack, default Provider

**Workspace Selection**:
The authoritative desired Provider and Add-on choices recorded only for a Maintainer Workspace. It is not retained as a receipt or management contract in a Customer Workspace.
_Avoid_: Scaffold receipt, customer ownership ledger

**Preset**:
A reusable, explicit request containing Provider and Add-on choices for a new composition. A Preset references Selection Definitions but does not replace their compatibility declarations or become retained management state in the Customer Workspace.
_Avoid_: Default stack, Reference Composition, scaffold receipt

**Provider Slot**:
A dimension of the stack that governs how many Providers may be selected for a role. The v1 Auth, CMS, and Commerce slots each require exactly one Provider; future compositions may support different cardinalities when the application does.
_Avoid_: Optional integration, package alias

**Slot Cardinality**:
The minimum and maximum number of Providers a composition may select for a Provider Slot. V1 assigns `1..1` to Auth, CMS, and Commerce.
_Avoid_: Permanent exactly-one invariant

**Provider**:
A selectable implementation that fills one Provider Slot and may depend on other registry items.
_Avoid_: Provider package, registry item

**Provider Alias**:
The stable workspace package name through which Baseline code imports the Provider selected for one Provider Slot. Each slot defines its own current package interface; a Provider may satisfy part of that interface with an explicit no-op when the capability is validly unnecessary. V1 does not assign independent version numbers to these interfaces.
_Avoid_: Concrete Provider package, generated binding module, universal Provider interface

**Add-on**:
An optional composition selection that may depend on other registry items and is valid only when its compatibility requirements are satisfied by the complete selected stack.
_Avoid_: Provider, optional package

**Selection ID**:
The stable, globally scoped identity of a Provider or Add-on, independent of where its materialization content is obtained.
_Avoid_: Registry URL, repository path, registry item name

**Selection Definition**:
The Provider- or Add-on-owned metadata that identifies a selection and declares its compatibility and package-specific requirements. Standard ShadCN fields describe its files, dependencies, and registry dependencies.
_Avoid_: Registry catalog entry, Composition Plan

**Selection Definition Schema**:
The current JSON Schema for a complete ShadCN registry item containing `meta.nextHydra`. A companion Source Registry schema applies it to Selection Definitions inside colocated registry files while ordinary registry items continue to use ShadCN's schema directly. V1 follows one stable schema URL rather than exposing numbered schema generations.
_Avoid_: Registry item schema, Customer Workspace version, Provider package version

**Contribution Source**:
The canonical code maintained for a registry item. Provider implementation code stays in its normal development location. A Managed Application File instead uses the contribution's `registry/` source directory because its runnable target belongs elsewhere in the workspace.
_Avoid_: Materialized application copy, Customer Workspace receipt

**Source Registry**:
The standard ShadCN `registry.json` structure used to distribute Contribution Sources. Next Hydra keeps a root registry that includes package- and application-level `registry.json` files beside the code they describe. Managed Application Files live under a colocated `registry/` directory as canonical source, not as generated content-inlined item JSON. Public GitHub and local development resolve these source files directly; v1 does not require checked-in content-inlined registry output.
_Avoid_: Generated template tree, Customer Workspace receipt, registry server

**Registry Artifact**:
The resolved installable ShadCN representation of a registry item. ShadCN may produce it in memory from a local or public GitHub Source Registry, or a hosted registry may serve equivalent generated JSON. It is not a second checked-in source tree and official v1 does not require persistent generated artifacts.
_Avoid_: Canonical source, required build folder, Customer Workspace receipt

**Binary Asset**:
A byte-for-byte file contribution declared separately when ShadCN's text-based source loader cannot safely represent the file. V1 uses this only while composing from the official or locally included Source Registry; separately fetched external Selections cannot contribute Binary Assets.
_Avoid_: General file-copy operation, executable hook

**Composition Plan**:
The deterministic, validated expansion of a Baseline, selected Providers, and Add-ons into declarative materialization work. It contains no Provider-supplied executable hooks.
_Avoid_: Setup script, Provider hook

**Managed Application File**:
A Provider- or Add-on-owned registry file placed outside that contribution's normal source directory, such as a Next.js route under `apps/web`. Its source lives under the contribution's colocated `registry/` directory. Maintainer `use` may replace known Managed Application Files when changing the selected stack; after scaffolding or customer `add`, the copied file is customer-owned.
_Avoid_: Generated adapter, ownership receipt, customer-managed file

**Additive Installation**:
A customer-approved materialization that inspects the intact requested registry graph, creates missing targets, skips identical targets, and treats changed targets as explicit conflicts without inferring ownership or removing code. V1 accepts only explicitly targeted exact-copy ShadCN file types so its preview matches the installed content. It checks compatibility visible through the graph and exact known Provider aliases and discloses assumptions that cannot be proven without customer selection state.
_Avoid_: Recomposition, synchronization, provider switch, Customer Workspace upgrade

**Compatibility Declaration**:
A Provider- or Add-on-owned statement naming the concrete Providers or Add-ons it requires or conflicts with. It must be satisfied before a closed-world composition can be materialized; Workspace Composition validates declarations but does not centrally re-author them. Customer Additive Installation hard-fails observable violations and discloses requirements whose state cannot be proven without a receipt.
_Avoid_: Central compatibility matrix, registry dependency
