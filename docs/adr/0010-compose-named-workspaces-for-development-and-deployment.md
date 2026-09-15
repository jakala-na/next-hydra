# Compose Named Workspaces for Development and Deployment

Status: Accepted

Keep the Maintainer Workspace source-only and use named compositions to develop and deploy applications. Customer creation and named composition share the same constructor, while retaining different ownership contracts. This lets maintainers edit canonical source, exercise different provider selections, and deploy ordinary copied applications without committing assembled code or maintaining a separate export workflow.

## Relationship to ADR-0004

This decision partially supersedes [ADR-0004](0004-use-next-hydra-over-shadcn-for-workspace-composition.md):

- Named workspaces may commit app-local deployment settings and derived Turbo task metadata alongside their definitions and optional READMEs; those two files are no longer the only permitted inputs.
- Linking ordinary source is the development default, not the only materialization mode. Named workspaces also support copied source in the same directory and refresh lifecycle.
- Customer applications retain Portless and their package-owned development commands; removing Portless is not part of customer scaffolding.

ADR-0004's registry protocol, shared web application, whole-package Commerce selection, declarative recipes, and customer ownership boundary remain accepted. This decision does not introduce app profiles, independently selectable cart or checkout features, or ongoing customer recomposition.

## Decision

### One named workflow, shared composition logic

`compose <name>` initializes or refreshes `workspaces/<name>` from its committed `next-hydra.json`. Source linking is the default; `--no-link` materializes physical copies at the same location. These are two source modes of one workflow, not separate export and reuse APIs. `--all` discovers named definitions. In-place `use` and the separate `--output` and `--reuse` modes are not retained.

Each named workspace has its own materialized manifests, provider aliases, lockfile and installed dependencies. Eligible implementation files, including provider-owned application routes, link individually to canonical source during development. Templates, transformed files, manifests and other composition-sensitive files stay physical. Maintainers edit canonical modules and templates, then refresh composed files; the root checkout does not keep a second assembled layout or provider route tree.

The root customer-creation command acquires the requested source revision and uses the same constructor to produce ordinary copied code in a fresh destination. It does not retain maintainer selection or ownership state, source links, or a requirement to regenerate files after handoff. Named copied output remains maintainer-managed; copying alone does not turn it into a Customer Workspace.

### Commit intent and deployment settings, not assembled applications

Within each named workspace, commit the definition, an optional README, independently authored `apps/<app>/vercel.json` files, and `tasks/package.json` plus `tasks/turbo.json`. The task metadata is derived from the composition constructor, registered in the outer pnpm workspace and checked for drift in CI. Materialized application source, runtime manifests, dependencies, applied state, caches and credentials remain ignored. Deployment and task settings belong to the named workspace, not to registry refresh, and remain physical files.

Customer scaffolds retain the registry's existing app-local `vercel.json` defaults and skip-CI scripts. They do not receive maintainer composition commands or deployment-specific cache settings. Customers can continue using dashboard build settings or edit their own configuration files.

### Preserve local development behavior and credential boundaries

Both customer and named workspaces include Portless and preserve package-owned commands. Host names derive from the customer project name or named workspace rather than hand-edited materialized manifests; customer names remain product-neutral. Copied mode does not apply maintainer-only fixed development ports. Fixed-port troubleshooting remains a package concern, not a reason to remove Portless.

`--copy-env` is an explicit linked-development option that copies missing local environment files into matching paths. Registry defaults also seed missing files. Neither mechanism replaces existing destination environment files, and applied state stores neither credentials nor their fingerprints. Copied deployment does not import ignored source credentials; hosted credentials and service URLs come from the deployment environment. Switching to copied mode does not scrub environment files already present locally.

### Compose inside the Git deployment

Deploy maintained applications directly from the same named folders used locally. Each Vercel project selects its application root, such as `workspaces/storefront-contentstack/apps/web`. Its committed Install Command installs source tooling, runs `compose storefront-contentstack --no-link`, and installs the selected dependency graph. Its Build Command runs that application's build from the composed workspace, leaving `.next` under the selected app root.

There is no separate deployment directory, required mirror repository, or GitHub Actions workflow uploading artifacts through the Vercel CLI. The PHP Drupal backend retains its separate deployment mechanism. Composition materializes code and dependencies; external service provisioning remains an explicit, separate operation.

### Select affected compositions with Turbo

Before installation, the Vercel ignore command queries the named workspace's outer `build` task with `turbo query affected --tasks build --packages @workspaces/<name>`. Selected canonical inputs come from the actual constructor, including transitive package sources and registry rendering inputs. Turbo owns file matching and task-dependency propagation; there is no separate changed-file detector or deployment inventory. The task depends on the composition CLI build and its lifecycle is uncached. Selected source groups are package-granular, so the gate may conservatively select a build whose materialized output is unchanged.

The query runs at the source repository root: a nested application's affected query cannot see canonical source changes above its own root. The small `tasks/` package avoids treating the application's root `turbo.json` as an outer package configuration. The application task configuration stays identical for equivalent customer, copied and linked compositions. Customer workspaces receive neither outer task metadata nor maintainer source paths.

`workspace:sync` derives committed metadata using disposable composition staging, then delegates outer lockfile synchronization to pnpm's lockfile-only mode with lifecycle scripts disabled. No application dependencies or credentials are installed. The command retries lockfile resolution even when task files are already current. `workspace:check` enforces metadata freshness and frozen-lockfile compatibility in CI without repairing either. Metadata is not a second authored selection. The gate uses the previous successful deployment commit and allows builds for unavailable history, query failures and incomplete external source ownership. Environment and external content changes retain explicit redeploy controls. Metadata updates and corresponding outer lockfile importer changes must be committed together.

### Refresh safely and preserve caches

Named initialization accepts committed settings and restored cache directories even when applied state is absent; it does not accept arbitrary preexisting source or redirected cache roots. Refresh preserves deployment and task settings and caches, rejects conflicting managed-file edits, and removes only unchanged owned files or links. Unregistered files are reported and preserved, and block copied refresh. Applied state supports conflict detection and interruption recovery, not backup or automatic adoption.

Dependency installation is needed when inputs change, dependencies are missing, or installation needs reconciliation or retry. An initialized workspace does not reinstall unchanged dependencies just because a template changed. A fresh hosted checkout still reconciles dependencies when ownership state is absent, even if dependency caches were restored.

Customer, linked and copied workspaces share application task and cache semantics. Cache keys must account for materialized source content, dependency inputs and build-affecting environment variables, including linked files beneath ignored workspace directories. Build outputs must not become source inputs. Deployment-specific cache placement belongs to the build invocation: Vercel uses `node_modules/.cache/turbo` for Turbo artifacts, while Next's incremental cache remains separate. Composition must not clear either cache to refresh source.

## Considered Options

- **Keep a committed maximal application and switch it in place.** Rejected because selection changes create source churn and only one composition can be exercised at a time.
- **Maintain separate export directories and output/reuse commands.** Rejected because deployment identity, configuration and refresh behavior drift away from the named workspace being developed.
- **Deploy source-linked output.** Rejected as the hosted default because builds should resolve against the selected copied workspace, not the canonical checkout's source layout.
- **Use the customer-creation command for every maintained deployment.** Rejected because its fresh-directory, customer-owned handoff intentionally lacks the safe refresh and cache-preserving lifecycle needed by maintained workspaces.

## Consequences

Vercel Root Directory and access to sources outside it require project setup; committing a nested `vercel.json` does not relocate an existing project. Test branch deployments in isolated projects before coordinating production root changes with the merge. Hosted credentials, callback allowlists and sibling application URLs remain operator-owned. Configuration files do not migrate those settings automatically.

New files created inside an ignored workspace still require reconciliation into canonical source and registry ownership. `--check` and `--explain` make that work visible; automatic adoption is not part of this decision. Existing supported named workspaces must have a safe ownership-aware migration path when materialization or settings ownership changes.

The trade-off is separate tooling and selected-workspace dependency installations, plus explicit template refresh. In return, Git tracks authored intent rather than generated applications, local development exercises real compositions, and deployments use stable paths without imposing maintainer management on customers.

Operational commands and deployment setup live in [Named workspaces](../../workspaces/README.md); customer and maintainer CLI contracts live in the [create-next-hydra guide](../../packages/create-next-hydra/README.md).
