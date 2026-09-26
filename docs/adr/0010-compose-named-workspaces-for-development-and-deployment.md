# Compose Named Workspaces for Development and Deployment

Status: Accepted; execution and environment refinements are recorded in [ADR-0011](0011-effect-workspace-execution.md).

Keep the Maintainer Workspace source-only and use named compositions to develop and deploy applications. Customer creation and named composition share the same constructor, while retaining different ownership contracts. This lets maintainers edit canonical source, exercise different provider selections, and deploy ordinary copied applications while keeping assembled code out of source control.

## Scope

[ADR-0004](0004-use-next-hydra-over-shadcn-for-workspace-composition.md) defines the registry protocol, shared web application, whole-package Commerce selection, declarative recipes and customer ownership boundary. This decision defines the named workspace lifecycle: physical materialization, source inspection, safe refresh, committed settings and deployment.

## Decision

### One named workflow, shared composition logic

`compose <name>` initializes or refreshes `workspaces/<name>` from its Git-visible `next-hydra.json`. All application files are physical copies. Development and deployment use the same materialization and cache-preserving refresh. `--all` discovers named definitions, including new untracked ones.

Each named workspace has its own materialized manifests, provider aliases, lockfile and installed dependencies. Implementation files, provider-owned routes, templates, transformed files and manifests all materialize as physical files. Maintainer and customer output share imports and aliases; no resolver workaround points back to the source checkout. Maintainers edit canonical modules and templates, then refresh composed files; the root checkout does not keep a second assembled layout or provider route tree.

The root customer-creation command acquires the requested source revision and uses the same constructor to produce ordinary copied code in a fresh destination. It does not retain maintainer selection or ownership state, or a requirement to regenerate files after handoff. Named output remains maintainer-managed; copying alone does not turn it into a Customer Workspace.

### Commit intent and deployment settings, not assembled applications

Within each named workspace, commit the definition, its root and optional `apps/<app>/.gitignore` files, an optional README, and independently authored `apps/<app>/vercel.json` files. Materialized application source, runtime manifests, dependencies, applied state, caches and credentials remain ignored. Ignore rules and deployment settings belong to the named workspace, not to registry refresh, and remain physical files. Each workspace owns its Git allowlist without a source-root inventory of workspace names. Customer ignore rules remain ordinary scaffold output.

New workspace files are untracked rather than hidden by a parent ignore policy. Compose seeds a missing workspace-local `.gitignore` with settings-only defaults, never replaces an existing file, and reports a missing file without creating it in check mode. Authors may customize that policy, including supplying an empty file; normal repository-wide exclusions still protect secrets and caches. Disposable verification uses uniquely allocated directories with cleanup rather than persistent experimental workspace names.

Customer scaffolds retain the registry's existing app-local `vercel.json` defaults and skip-CI scripts. They do not receive maintainer composition commands or deployment-specific cache settings. Customers can continue using dashboard build settings or edit their own configuration files.

### Preserve local development behavior and credential boundaries

Both customer and named workspaces include Portless and preserve package-owned commands. Host names derive from the customer project name or named workspace rather than hand-edited materialized manifests; customer names remain product-neutral. Named definitions may opt into fixed internal development ports; project creation leaves port allocation to Portless. Fixed-port troubleshooting remains a package concern, not a reason to remove Portless.

`--copy-env` is an explicit local-development option that copies missing local environment files into matching paths. Examples remain documentation; provisioning owns creation of runtime values. Existing destination environment files are preserved, and applied state stores neither credentials nor their fingerprints. Deployment without `--copy-env` does not import ignored source credentials; hosted credentials and service URLs come from the deployment environment. Refresh does not scrub environment files already present locally.

### Compose inside the Git deployment

Deploy maintained applications directly from the same named folders used locally. Each Vercel project selects its application root, such as `workspaces/storefront-contentstack/apps/web`. Its committed Install Command installs source tooling, runs `compose storefront-contentstack`, and installs the selected dependency graph. Its Build Command runs that application's build from the composed workspace, leaving `.next` under the selected app root.

The hosting service materializes and builds the named application within its Git deployment. The PHP Drupal backend has its own deployment mechanism. Composition materializes code and dependencies; external service provisioning remains an explicit, separate operation.

### Cache builds in the installed application workspace

Every deployment reaches composition and dependency reconciliation before invoking an ordinary filtered Turbo build from the installed workspace root. There is no outer affected-composition gate, generated canonical-source task inventory or metadata synchronization lifecycle. The application task configuration stays identical for equivalent customer and named compositions. Explicit inputs include materialized source even beneath Git-ignored workspace directories; task outputs and build-affecting environment remain part of the ordinary cache contract.

Vercel Root Directory stays at the selected app. Its Install Command changes to the repository root and installs the `next-hydra...` and `create-next-hydra...` dependency closures, then composes the selected workspace. Its Build Command changes to the installed workspace root. The source checkout retains its pnpm package declarations for canonical package discovery and source-level development; narrowing installation does not remove those declarations.

Compose is explicit. After composition, named and customer workspaces run the same application scripts within their own installed dependency graphs. Root build/typecheck target the composition CLI, not applications. New definitions require no task-package registration.

### Refresh safely and preserve caches

Named initialization and refresh allow unrelated local files, including source experiments, notes and generated artifacts. They preserve those files without adopting them, regardless of Git ignore rules. Preflight checks protect existing owned files and reject unowned files or directories colliding with intended output paths; they do not require a clean workspace or a complete catalog of build artifacts. Refresh preserves deployment settings, ignore rules and caches, rejects conflicting managed-file edits, and removes only unchanged owned files. `--check` evaluates managed output and dependency readiness; eligible unowned files are informational in `--diff`. Applied state supports conflict detection and interruption recovery, not backup or automatic adoption. Without state, existing files at intended targets remain unowned and block publication. Source and destination paths are trusted rather than governed by a generic symlink-defense subsystem.

Dependency installation is needed when inputs change, dependencies are missing, or installation needs reconciliation or retry. An initialized workspace does not reinstall unchanged dependencies just because a template changed. A fresh hosted checkout still reconciles dependencies when ownership state is absent, even if dependency caches were restored.

Customer and named workspaces share application task and cache semantics. Cache keys must account for materialized source content, dependency inputs and build-affecting environment variables, including physical files beneath ignored workspace directories. Build outputs must not become source inputs. Turbo uses its default local cache at `.turbo/cache` and its configured Remote Cache; deployment commands do not override cache placement. Next's incremental cache remains separate. Composition must not clear either local cache to refresh source.

## Rationale

Each composition needs an isolated dependency graph and ordinary files that resolve exactly as a scaffolded application does. A stable named directory provides that isolation while allowing ownership-aware refresh and cache reuse. Canonical modules and templates remain the authored source of truth; composed output provides the runnable application for development and deployment.

## Consequences

Vercel Root Directory and access to sources outside it require project setup; committing a nested `vercel.json` does not relocate an existing project. Test branch deployments in isolated projects before coordinating production root changes with the merge. Hosted credentials, callback allowlists and sibling application URLs remain operator-owned. Configuration files do not migrate those settings automatically.

New files created inside an ignored workspace may remain local across refreshes. Reconcile them into canonical source and registry ownership only to include them in future compositions, leaving their destination targets free for the first managed installation. `--diff` lists eligible unowned files; `--check` evaluates managed output, target collisions and dependency readiness, not unrelated local files. `--explain <file>` locates a managed file's canonical edit target. Automatic adoption is not part of this decision. Refresh rejects conflicting managed-file edits; dependency links created by pnpm remain part of normal package installation.

Named compositions retain a private local Git snapshot outside the application for read-only `--diff` inspection. Snapshots contain verified owned files, excluding environment files, known credential paths and runtime artifacts. Unregistered files are reported independently of Git ignore rules without being staged. Snapshot history does not replace ownership checks or source mappings, and customer project creation does not include it. `--explain` without a file lists the current selection's complete source inventory.

The trade-off is separate tooling and selected-workspace dependency installations, plus explicit source/template refresh. Deployments also pay setup and composition costs even when compilation is a cache hit. Turbo Remote Cache restores task outputs, not installed dependencies; Vercel/pnpm caching reduces installation work but does not guarantee it is skipped. Cross-project reuse requires matching task inputs and environment. In return, Git tracks authored intent rather than generated applications, local development exercises real compositions, and deployments use stable paths without imposing maintainer management on customers.

Operational commands and deployment setup live in [Named workspaces](../../workspaces/README.md); customer and maintainer CLI contracts live in the [create-next-hydra guide](../../packages/create-next-hydra/README.md).
