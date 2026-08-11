# Generator recipes and provider contributions

Type: research
Status: resolved
Blocked by: None

## Question

Research how `create-better-t-stack` represents selectable technologies and materializes their dependencies, configuration, routes, templates, and conditional files. Determine whether its source of truth is package-owned, generator-owned, or split; how it handles conflicts and combinations; and whether it supports repeatedly switching a technology in an existing developer workspace or only one-time project generation.

Compare its design with the strongest relevant primary-source alternatives, such as package-owned generators, recipe or registry systems, and monorepo generator frameworks. Focus on applicability to Next Hydra's combination of:

- stable aliased CMS imports with provider-specific App Router routes;
- provider-neutral Commerce code with an installed provider Layer package;
- one-time `create-next-hydra` provisioning; and
- frequent maintainer switching without manual file juggling or tracked-worktree churn.

Recommend which ideas deserve a prototype and which should be rejected. Do not design the final Next Hydra contract yet.

## Research output

Write the cited findings to `../research/01-generator-recipes-and-provider-contributions.md`.

## Answer

The cited findings are recorded in [Generator recipes and provider contributions](../research/01-generator-recipes-and-provider-contributions.md).

`create-better-t-stack` is a centrally owned scaffold generator, not a package-owned contribution system. Its typed option matrix, compatibility checks, templates, dependency processors, and imperative setup helpers are useful prior art for validating combinations, but its existing-project workflow only adds addons. It does not remove or replace core providers or guarantee an `A -> B -> A` round trip.

The strongest prototype ingredients come from different systems:

- shadcn-like declarative contribution descriptors with explicit target files, dependencies, environment hints, nested contributions, schema validation, and dry-run/diff UX;
- Nx-like idempotent sync and check-only drift semantics, without adopting Nx;
- centralized combination validation and matrix tests, as demonstrated by `create-better-t-stack`; and
- Next Hydra's existing Turbo/Plop generator as a maintainer-local execution harness rather than the contribution contract.

No researched system supplies provider ownership, safe deprovisioning, conflict handling, and clean repeated switching as one ready-made solution. A round-trip prototype must establish those semantics before the final architecture is selected.
