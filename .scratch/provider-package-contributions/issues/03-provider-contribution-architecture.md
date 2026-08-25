# Provider bundles and add-on compatibility

Type: grilling
Status: resolved
Blocked by: 01, 02

## Question

What are the canonical selectable units and compatibility semantics for a composed Next Hydra workspace?

Decide how a CMS or Commerce provider describes a required bundle of packages, Backend Apps, provider-native modules or extensions, routes, configuration, and tooling. Decide how optional add-ons declare requirements and incompatibilities against selected providers and other add-ons, including cross-provider add-ons such as a Drupal module for Commercetools. Establish whether compatibility belongs to the add-on, the provider bundles, a central catalog, or a combination of those sources.

## Comments

- Agreed composition vocabulary: every workspace has a mandatory **Baseline**; Auth, CMS, and Commerce are required **Provider Slots** with exactly one selected **Provider** each; **Add-ons** are optional selections. A Provider or Add-on is a selectable ShadCN registry item and may use standard `registryDependencies` for inseparable implementation pieces.
- Agreed compatibility ownership: each Provider or Add-on owns its requirements and conflicts; nested implementation items do not own independent compatibility policy. `create-next-hydra` owns universal slot invariants and validates the complete selection. A curated catalog may govern discovery but does not duplicate declarations into a centrally authored compatibility matrix.
- Agreed v1 compatibility expression: declarations reference concrete Provider and Add-on identifiers. Abstract capability tags are deferred until multiple real Providers demonstrate an interchangeable capability that needs them.
- Agreed definition ownership: a Provider or Add-on is represented by a self-describing top-level ShadCN `registry:item`; `meta.nextHydra` owns its kind, slot, and compatibility declaration, while standard ShadCN fields own files and registry dependencies. A catalog curates and discovers selections but does not define them, so private items need not enter the central catalog.
- Agreed selection identity: each Provider or Add-on declares a stable, globally scoped Selection ID independent of its local path, repository address, or registry URL. Compatibility declarations reference Selection IDs so moving content between registry transports does not rewrite the composition model.
- Agreed enforcement: `requires` and `conflicts` are hard preflight constraints. Interactive selection explains unavailable Add-ons; explicit arguments and private items fail before any write when invalid. V1 has no silent Provider substitution, warning-only compatibility, or install-anyway override.
- Cardinality caveat: exactly one Auth, CMS, and Commerce Provider is a v1 application constraint, not a permanent definition of Provider Slot. Disabling Commerce or Auth requires changing web-shell components/providers, while selecting multiple CMS Providers conflicts with the current single package seam. Future zero-or-many support remains possible only after those application boundaries exist.
- Agreed cardinality contract: every Provider Slot declares minimum and maximum selections; Auth, CMS, and Commerce are all `1..1` in v1. Changing cardinality remains invalid until the corresponding application composition seam exists.
- Agreed requirement expansion: Provider requirements constrain the already selected slots and never silently substitute a Provider. Required Add-ons are resolved transitively and disclosed in the composition plan before confirmation; inseparable implementation pieces remain ordinary registry dependencies rather than separate Add-ons.

## Answer

The canonical composition is a mandatory **Baseline**, cardinality-governed **Provider Slots**, selected **Providers**, and optional **Add-ons**. Auth, CMS, and Commerce are each `1..1` in v1 because the current application assumes one selected implementation, while the model leaves future cardinalities representable without claiming the application already supports them.

Each Provider or Add-on is a self-describing top-level ShadCN `registry:item`. Its `meta.nextHydra` data owns a stable, registry-location-independent **Selection ID**, its kind and Provider Slot, and its **Compatibility Declaration**. Standard ShadCN fields own its files and `registryDependencies`, with every copied file naming its final workspace-root target. The curated catalog discovers and presents selections; it does not duplicate their definitions or compatibility, allowing private items to participate.

Compatibility declarations use concrete Provider and Add-on Selection IDs in v1; a capability taxonomy is deferred until real interchangeable implementations require one. `requires` and `conflicts` are hard constraints evaluated across the fully resolved composition before any write. Provider requirements never silently change selected slots. Required Add-ons are included transitively and shown in the plan before confirmation. Invalid explicit or private selections fail, with no warning-only or install-anyway mode in v1.
