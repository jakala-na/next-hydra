# Use Next Hydra over ShadCN for Workspace Composition

Status: Accepted

Next Hydra will use ShadCN's registry protocol for distributing code, with `create-next-hydra` adding the Provider, Add-on, compatibility, and workspace composition rules specific to Next Hydra. This gives Next Hydra more governance than raw ShadCN without building and maintaining a complete custom generator.

## Considered Options

### Next Hydra composition on ShadCN — selected

Next Hydra owns stack selection and validation while ShadCN owns code distribution and installation. This provides one supported workflow for maintainer development, initial scaffolding, Presets, and compatible Add-ons.

### Better T Stack-style custom generator

Next Hydra could own templates, file copying, dependency changes, and every integration-specific mutation itself. This offers maximum control but duplicates capabilities already provided by ShadCN and creates a larger generator-specific template system to maintain.

### Raw ShadCN CLI

ShadCN can distribute files and dependencies, but it does not understand Next Hydra Provider Slots, cross-provider compatibility, Add-ons spanning multiple workspace roots, or the complete composition being requested. It remains available as an unsupported escape hatch rather than the governing workflow.

## Limitations

- A Customer Workspace cannot be authoritatively upgraded, switched to another Provider, or restored to an earlier Next Hydra composition. The customer owns the copied code and may have changed or removed anything after scaffolding.
- Customer `add` can install an explicitly requested item and report file conflicts, but it cannot prove that the existing workspace still has a particular Provider stack or automatically select an integration for it.
- Runtime Provider switching is out of scope. Composition happens while developing the Maintainer Workspace or creating a new Customer Workspace.
- Auth, CMS, and Commerce each require exactly one Provider in v1. Disabling one of those capabilities or selecting multiple Providers requires additional application seams.
- Composition provisions local code and JavaScript dependencies only. Provider accounts, secrets, remote CMS models, Drupal module enablement, Composer changes, deployed extensions, and other external setup remain manual.
- Providers and Add-ons are declarative. V1 does not allow them to run arbitrary installation hooks.

The detailed mechanics, delivery sequence, and acceptance evidence are recorded in the [Provider and Add-on Composition map](../../.scratch/provider-package-contributions/map.md).
