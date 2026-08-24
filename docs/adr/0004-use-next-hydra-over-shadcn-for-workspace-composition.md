# Use Next Hydra over ShadCN for Workspace Composition

Status: Accepted

Next Hydra will use ShadCN's registry protocol for distributing code, with `create-next-hydra` adding the Provider, Add-on, compatibility, and workspace composition rules specific to Next Hydra. This gives Next Hydra more governance than raw ShadCN without building and maintaining a complete custom generator.

## Considered Options

### Next Hydra composition on ShadCN — selected

Next Hydra owns stack selection, intact registry-graph preflight, compatibility and target-conflict validation, the maintainer-only removal of files belonging to inactive selections, and package-specific `package.json` entries. ShadCN remains the registry transport and installation engine: Next Hydra prepares the exact validated artifacts, then ShadCN installs every copied file, including Provider-specific Next.js routes, from the workspace root using explicit final targets. This provides one supported workflow for maintainer development, initial scaffolding, Presets, and compatible Add-ons.

### Better T Stack-style custom generator

Next Hydra could own templates, file copying, dependency changes, and every integration-specific mutation itself. This offers maximum control but duplicates capabilities already provided by ShadCN and creates a larger generator-specific template system to maintain.

### Raw ShadCN CLI

ShadCN can distribute files to multiple workspace locations when registry items declare explicit workspace-root targets, and it can traverse registry dependencies. It does not understand Next Hydra Provider Slots, cross-provider compatibility, which existing Provider files a maintainer switch should remove, package-specific dependencies, or the complete composition being requested. Raw `shadcn add` therefore remains an incomplete escape hatch for Next Hydra-aware items rather than the governing workflow.

## Limitations

- A Customer Workspace cannot be authoritatively upgraded, switched to another Provider, or restored to an earlier Next Hydra composition. The customer owns the copied code and may have changed or removed anything after scaffolding.
- Customer `add` can install an explicitly requested item, inspect its complete intact registry-dependency graph, and report file conflicts before ShadCN flattens the graph. It accepts only explicitly targeted exact-copy `registry:file` and `registry:item` file entries; ShadCN file types that require transformations are unsupported because the wrapper cannot truthfully preview their installed content. Known Provider compatibility is inferred from exact stable aliases currently present in `apps/web/package.json`; unknown requirements are disclosed but cannot be proven without retained selection state. This is not a receipt and cannot prove that customer-owned provider files remain complete or unchanged.
- Runtime Provider switching is out of scope. Composition happens while developing the Maintainer Workspace or creating a new Customer Workspace.
- Auth, CMS, and Commerce each require exactly one Provider in v1. Disabling one of those capabilities or selecting multiple Providers requires additional application seams.
- Composition provisions local code and JavaScript dependencies only. Explicit provider-owned workspace administration commands may perform confirmed, one-off remote provisioning after scaffolding and publish their runtime manifest to a selected configuration store; those commands are separate from composition and are never arbitrary installation hooks. External setup without such a command remains manual.
- Providers and Add-ons are declarative. V1 does not allow them to run arbitrary installation hooks.

The accepted contract is recorded in the [Provider and Add-on Composition specification](../../.scratch/provider-package-contributions/spec.md); its decision history and delivery sequence remain in the [Wayfinder map](../../.scratch/provider-package-contributions/map.md).
