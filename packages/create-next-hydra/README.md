# create-next-hydra

`create-next-hydra` composes customer-owned applications from selected Providers and compatible Add-ons. There is one shared web application: CMS is required, Auth is optional, and Commerce requires Auth. Commerce is installed as one complete package, not separately selectable catalog, cart, or checkout features. It uses [ShadCN registry items](https://ui.shadcn.com/docs/registry/registry-item-json) to copy code and adds stack validation and package-specific manifest changes.

## Create a project

Interactive scaffolding asks for every required Provider:

```bash
pnpm dlx create-next-hydra@latest my-project
```

For a non-interactive scaffold, provide all three Providers or a Preset:

```bash
pnpm dlx create-next-hydra@latest my-project --yes \
  --auth workos \
  --cms drupal \
  --commerce commercetools

pnpm dlx create-next-hydra@latest my-project --yes --preset standard

pnpm dlx create-next-hydra@latest content-site --yes \
  --cms contentstack --without auth --without commerce
```

Use `--add-on <selection>` more than once to include compatible Add-ons. A selection can be an official shorthand, a local registry-item JSON file, a URL, a public GitHub address such as `owner/repository/item#ref`, or a configured ShadCN registry name.

The customer destination must be missing or an empty physical directory, without symlinked parents. Named workspaces support safe initialization and updates instead. Customer applications retain the registry's existing `vercel.json` defaults and app-local skip-CI scripts. Maintainer composition commands and cache-location settings are not added to these customer files.

Customer projects include Portless. Run `pnpm dev` in the installed project for stable `<app>.<project>.localhost` origins and automatically allocated application ports. The project hostname label replaces dots/underscores with hyphens and is limited to 63 characters. Package-owned dev scripts, including API tunneling, remain intact. Local HTTPS may require Portless's one-time proxy/certificate setup; remote authentication callback allowlists must match the actual development origins. Drupal's `dev:web` command keeps Portless while pinning the internal frontend port for DDEV revalidation.

## Initialize and update named workspaces

The preferred maintainer workflow uses committed definitions in `workspaces/`. No `apps` field or app-profile flag is needed: the shared web application is implicit, and selected packages extend its templates.

```sh
pnpm --filter create-next-hydra compose cms-contentstack --copy-env
pnpm --filter create-next-hydra compose cms-contentstack --no-link
pnpm --filter create-next-hydra compose --all --copy-env
pnpm --filter create-next-hydra compose cms-contentstack --watch
pnpm --filter create-next-hydra compose --all --check
pnpm --filter create-next-hydra compose cms-contentstack --explain 'apps/web/app/[locale]/layout.tsx'
pnpm --filter create-next-hydra compose cms-contentstack --run typecheck
pnpm --dir workspaces/cms-contentstack dev
```

The same command initializes or updates the same folder. Ordinary files are source-linked by default; `--no-link` uses physical copies for deployment or customer-like verification. Composed files stay physical in either case. Refresh preserves caches and does not reinstall unchanged dependencies. Local edits block conflicting updates; unregistered files are reported and preserved, and block copied refresh. `--no-install` leaves dependency installation pending, `--offline` uses the local store, and `--copy-env` copies only missing env files during linked development. It cannot be combined with `--no-link`. Watch mode reports dependency changes but does not install them after its initial run. External provisioning is separate.

See [Named workspaces](../../workspaces/README.md) for the four definitions, stable Portless hostnames, deployment settings, interruption recovery, and reconciliation instructions. Definitions, workspace-owned `.gitignore` files, optional READMEs, app-local `vercel.json` settings and derived `tasks/package.json` / `tasks/turbo.json` metadata are tracked; materialized runtime manifests, installed files and applied state are ignored. Compose preserves these ignore rules rather than regenerating them. The workspace name determines each Next app's `<app>.<workspace>.localhost` hostname (with Portless's branch prefix inside a Git worktree). Version-1 ad-hoc outputs remain intact and are not automatically adopted.

After adding or renaming a definition, changing selections, or changing registry/dependency membership, run `pnpm workspace:sync` from the source checkout. It derives the task files and asks pnpm to synchronize the outer lockfile without installing dependencies or running lifecycle scripts. Commit the task files and `pnpm-lock.yaml` together. `pnpm workspace:check` verifies metadata freshness and frozen-lockfile compatibility without repairing either. Ordinary source edits within a selected package do not require synchronization.

## Command boundaries

- `create-next-hydra <directory>` creates a customer-owned project. It acquires the requested source revision in a temporary directory, constructs only selected files and hands over ordinary copied source. There is no ongoing customer composition step.
- `create-next-hydra compose <name>` initializes or refreshes a named workspace from canonical source. `--no-link` copies rather than links sources; it does not change the location or refresh contract. `compose --all` covers all committed definitions; `compose --all --check` checks their local state.
- `create-next-hydra add <item>` performs additive installation into customer-owned code.

The old `use` command and its in-place switching implementation have been removed. An old invocation fails with migration instructions rather than creating a project named `use`. Move its desired provider/add-on choices into a named definition and run `compose`. Root composed files, duplicate provider routes and the old root selection have been removed: templates and canonical implementation source are authoritative. `--explain <file>` shows the selected owner and edit location without updating; `--run <task>` refreshes first and then runs the selected workspace's dev/build/test/typecheck task. Root `pnpm dev` runs the `storefront-contentstack` reference definition. Root `pnpm test` runs package/provider suites and composition checks from source, with common app integration tests only in that WorkOS + Contentstack + commercetools reference; build/typecheck still cover all named definitions. Customer creation and named composition share one constructor for the baseline, selected files, dependency closure, registry transformations, templates, aliases and patches. Customer scaffolding owns source acquisition and Git initialization; named composition owns linking and safe refresh.

## Deploy a named workspace

Deploy the same named folder used for development:

```sh
pnpm --filter create-next-hydra compose storefront-contentstack --no-link
pnpm --dir workspaces/storefront-contentstack exec turbo run build --filter=web
```

Copied composition uses the same application task configuration as customer creation. Source, dependency and environment changes invalidate caches; unchanged inputs can restore prior outputs. Host-specific cache placement belongs in the build invocation, not a different generated Turbo configuration. Portless remains installed; copied workspaces do not inherit `development.port` or copy ignored source credentials. Existing destination environment files are preserved, not scrubbed.

The `--output`, `--reuse`, `--linked` and ad-hoc provider flags on `compose` have been removed. Put selections in `next-hydra.json`; use `--no-link` for copied output. Refresh and cache preservation are automatic. Customer creation remains the root command. See [Vercel configuration and installation order](../../workspaces/README.md#deploy-a-composed-application).

## Local source linking and environment files

The old `--maintainer-workspace` flag and clone-and-prune implementation have been removed. Use a named definition and `compose <name> --copy-env`. Preserve existing legacy outputs and reconcile local work before initializing a named workspace.

Each workspace has its own manifests, lockfile and dependencies. Ordinary implementation files link individually to canonical source; directories, manifests, template outputs and composition-sensitive files remain physical. Third-party registry content without local source is copied and protected by named-workspace ownership checks. Files transformed by the registry installer stay physical so linking cannot undo their transformations.

Ignored local environment files named `.env` or `.env.*` are copied into matching directories of selected applications and packages. The primary checkout supplies defaults; the current worktree takes precedence. Copies are regular files with owner-only permissions (`0600`). Symlinked sources/destination parents and existing destination files, directories, or symlinks are rejected before copying; dependency/build directories and example files are excluded. Paths may be recorded in the maintainer receipt, but contents are never printed. These are local credentials, not distribution assets, and unused capability credentials inside a selected env file are not filtered out.

Provider-owned application files are linked individually to their canonical registry sources. A Drupal route materialized at `apps/web/app/api/draft/route.ts`, for example, points to `packages/cms-drupal/registry/apps/web/app/api/draft/route.ts`. The same mapping applies to a webhook route installed by its selected recipe. Named workspaces support selection changes and link/copy switching through safe refresh. Symlinked parents and dangling destination links are rejected before directory creation. No switch rewrites tracked applications or manifests in the maintainer checkout.

Authoring constraints:

- The maintainer checkout is the dependency environment for linked packages. Its `pnpm-workspace.yaml` must retain the union of patches required by all linkable Providers, and `pnpm install` must have been run there. The command rejects a composition whose required patch is missing from that superset.
- Package manifests, composed template outputs, composition-governed `tsconfig.json` files, and paths declared by `maintainerWorkspace.copy` stay physical. That metadata controls linking only: those files still ship in customer scaffolds. Keeping app environment, Next and test configuration physical ensures provider aliases resolve from the selected workspace. Other eligible app and provider files are live-linked by default. Use `--explain` before assuming an edit will reach source.
- New files and edits to physical copies are **work to preserve**. Named workspaces provide `compose --check`, but adoption remains manual. Reconcile changes into canonical source and registry ownership, run `pnpm registry:sync` and `pnpm registry:check`, then verify a fresh workspace. Keep the original output until this is done; applied state is not a backup.
- Refresh the same workspace after changing selections, templates, or dependency manifests. Failed updates preserve before/after fingerprints and can be retried after resolving the reported issue.

Named workspaces maintain `.workspace-composition.json` ownership fingerprints for safe refresh, whether linked or copied. This is not customer runtime input. Customer creation retains no receipt or source-root metadata and requires no ongoing generation step.

## Hardening and verification

The implementation uses one shared planner and module-reference renderer. Composition recipes bind normal modules into shared templates; materialized modules have ordinary filenames. The CLI builds with its own pinned TypeScript compiler rather than depending on a root-level executable.

Run the bounded local suite before accepting composition changes:

```sh
pnpm --filter create-next-hydra build
pnpm --filter create-next-hydra test --maxWorkers 2 --testTimeout 30000
pnpm registry:check
pnpm workspace:check
node packages/create-next-hydra/dist/cli.js compose --all --check
```

The suite covers the provider matrix, copied/source-linked materialization, template ownership and normalized path collisions, working-tree deletions, environment isolation and overwrite refusal, and workspace peer-dependency retention. Install-heavy E2E tests are a separate command and need sufficient local disk/store capacity. Local filesystem safety checks protect against pre-existing redirections and competing scaffold invocations; this is not a sandbox for hostile package lifecycle scripts or processes mutating the directory tree concurrently.

Whole-package and exact-route materialization are covered by local tests. Named-workspace tests also cover template refresh, dependency retry, link replacement, local-edit protection, unregistered files and interruption recovery. Fresh external provisioning, hosted authentication, payment journeys and production builds remain separate integration gates. `compose --check` reports reconciliation work; automatic adoption is not implemented.

## Add code to a customer workspace

Run `add` from an existing customer-owned workspace:

```bash
pnpm dlx create-next-hydra@latest add owner/repository/drupal-dam
```

The command walks the complete registry dependency graph before ShadCN flattens it, rejects duplicate file targets, and lists every prospective file, package entry, and other ShadCN-managed effect. It verifies known Provider requirements through exact aliases in `apps/web/package.json` and labels compatibility requirements that cannot be proven without a customer receipt. The inspected graph is prepared locally so the exact approved artifacts are also the installation input. To keep that preview truthful, customer `add` accepts only explicitly targeted, exact-copy `registry:file` and `registry:item` file entries; file types that ShadCN would transform are rejected. It creates missing files, skips files ShadCN considers identical after newline and surrounding-whitespace normalization, and asks before replacing a changed file or dependency. Like ShadCN, `--yes` skips confirmation prompts and `--overwrite` authorizes replacing changed targets. Combine them for a fully non-interactive installation after reviewing the disclosed plan. `--yes` alone still refuses changed customer code. When package-specific entries change, `add` runs the root `pnpm install` to settle the lockfile and workspace links. The command never deletes files and does not retain a receipt.

Customer `add` accepts ordinary registry items and Next Hydra Add-ons. It does not switch Providers or apply Presets. In v1, an Add-on that declares separate binary assets or pnpm patches must be selected in a Maintainer Workspace or during a new scaffold.

## Author a Provider, Recipe or Add-on

Commerce's registry item depends on the composition recipes `commerce-web`, `commerce-api`, and `commerce-admin`. These wire the complete Commerce package into other applications; they are not independent shopping-feature choices. Auth owns its provider routes and its Commerce identity/webhook recipe. No application profile or separate web shell is required. The planner includes `app-web` automatically; the shared constructor includes only selected applications and their package dependency closure. Unselected source never enters the destination.

Recipe describes an assembly unit, not its size: recipes can depend on smaller recipes through `registryDependencies`. A recipe may install files and dependencies, bind module exports into template slots, or combine these. The individual placements are **slot bindings**, not separate recipes. Provider-specific **provisioning recipes**, such as Drupal configuration or Contentstack content blocks, configure external systems in a separate provisioning step. Composition can include their files but never executes them.

Keep source in its normal package or application directory and place a `registry.json` beside it. Add that registry file to the root `registry.json` `include` list. A registry containing Selection Definitions uses [`source-registry.json`](./schema/source-registry.json), which applies the complete [`selection-definition.json`](./schema/selection-definition.json) registry-item schema whenever an item contains `meta.nextHydra`. Ordinary registry items continue to use ShadCN's schema.

A Selection Definition declares:

- its stable ID and whether it is a Provider, Package, Recipe, Add-on, or Preset;
- a Provider Slot and one package `binding` when it is a Provider;
- an optional `binding.sourcePath` for resolving a maintained Provider directly to workspace source;
- `providerDependencies` for packages installed by the selection that consume a Provider Slot;
- standard ShadCN `registryDependencies` for any other registry items it needs;
- conditional dependencies for recipes activated by occupied Provider Slots;
- `providerSlots` requirements on a Package or Recipe, such as Commerce requiring Auth;
- required and conflicting selection IDs;
- ordinary exact package entries;
- exact pnpm patch entries and their patch-file assets;
- composition templates, named insertion slots, and ordered slot bindings;
- selection-owned TypeScript aliases needed for composed modules to resolve inside the workspace;
- maintainer-only copy boundaries for files that resolve selected resources relative to their own physical location; and
- setup instructions through the registry item's standard `docs` field.

Every copied registry file must have an explicit workspace-root target such as `~/packages/cms-drupal/src/index.ts`. The source `path` remains relative to the colocated registry, so maintainers edit and test canonical Provider code in its normal package or application.

When a Provider or Add-on needs to place a file outside its own source directory, keep that source under a colocated `registry/` directory using its final workspace path. For example, `packages/cms-drupal/registry/apps/web/app/api/draft/route.ts` is installed as `~/apps/web/app/api/draft/route.ts`. These files are ordinary ShadCN registry files: ShadCN installs them during scaffolding and customer `add`, while named `compose` links their canonical sources and may remove or replace unchanged owned targets when the selected stack changes.

A composition recipe may instead reference ordinary files already authored in the destination app, as `commerce-web` does for Checkout. Its colocated app registry declares those files, and the owning package depends on that item. This preserves direct authoring and source linking without making duplicate route templates or using unsupported parent-directory registry paths.

Run these commands after adding, moving, or removing registry-owned files:

```bash
pnpm registry:sync
pnpm registry:check
pnpm workspace:sync
pnpm workspace:check
```

`registry:sync` regenerates only each registry item's `files` list and its final workspace-root targets. Provider-owned metadata stays in the colocated registry file. `workspace:sync` then updates named-workspace task inputs and the outer lockfile from that registry; commit those changes together. Next Hydra first walks the intact `registryDependencies` graph to retain metadata and detect target conflicts, then prepares those exact artifacts and asks ShadCN to install them once from the workspace root.

Standard ShadCN `dependencies` and `devDependencies` apply to the workspace root. Use `meta.nextHydra.packages` only when an ordinary dependency must be added to a specific workspace package. Stable Provider aliases are derived from the slot and cannot be declared in `packages`.

Customer creation and named `compose` record those standard dependency fields through the same manifest logic before the final package install, including with `--no-install`. Only selected registry items and their transitive dependencies participate. Bare package names preserve existing requirements; a new bare name uses `latest` until installation resolves it. Explicit versions, tags, and named aliases are preserved, and conflicting explicit requirements fail during preparation. URL or local-path requirements must include a package name (`name@specifier`); unnamed sources cannot be resolved in an install-free plan. Customer `add` continues to use ShadCN's dependency installer.

Use `meta.composition.templates` for shared-file structure and `meta.composition.slotBindings` for references to ordinary module exports. This is the single renderer used by `compose` and initial scaffolding; the former text-snippet metadata and renderer have been removed. Modules remain normal TypeScript/TSX source, and targets have ordinary filenames with no ongoing customer generation step. A selection may declare `typeScriptAliases` when a linked consumer must resolve a composed target through its workspace instead of its source symlink's real path. Both target and alias are catalog-governed. Customer `add` rejects composition recipes and template recomposition because those files already belong to the customer.

Contentstack declares `conditionalDependencies: [{ providers: ["commerce"], items: ["cms-contentstack-product-collection"] }]`. The dependency is a `kind: "recipe"` item, not an Add-on; it adds the CMS mapping and `@repo/commerce` dependency whenever a Commerce provider is selected. It does not depend on a Commercetools selection. Registry discovery fetches possible recipes, while planning installs only applicable ones. Its `recipe/recipes/product-collection.json` is a Contentstack provisioning recipe: the provisioning command applies it to the base content type and seed entry before importing the stack.

A Provider declares its installable package once:

```json
{
  "kind": "provider",
  "slot": "cms",
  "binding": {
    "specifier": "npm:@vendor/cms-provider@^1.0.0"
  }
}
```

An Add-on that installs a package which imports the selected CMS declares the consumer, not a concrete CMS package:

```json
{
  "kind": "add-on",
  "providerDependencies": [
    {
      "cwd": "packages/vendor-search",
      "section": "dependencies",
      "slot": "cms"
    }
  ]
}
```

Scaffold and `compose` resolve that dependency to `@repo/cms` using the selected Provider's `binding.specifier`. If the Provider also declares `binding.sourcePath`, they write the exact alias and its `/*` wildcard into every selected consumer's `tsconfig.json` for direct-source development. Without `sourcePath`, pnpm's installed alias is the only resolution path and Next Hydra writes no TypeScript path override. Catalog-governed overrides are removed when they are no longer selected; named `compose --check` reports changed or stale physical configuration. Customer `add`, which has no retained selection receipt, copies the exact Provider alias already present in `apps/web/package.json` into each installed consumer.

ShadCN reads registry source files as text. For a binary file that must survive byte-for-byte, or a root patch file referenced by `pnpmPatches`, an official or locally included source-registry selection may declare a typed `assets` source and target instead. Separately fetched external selections cannot contribute assets in v1.

ShadCN registry mappings, including private registry URLs and environment-backed headers, are read from the invoking workspace's `components.json` or `package.json`, used for both graph preflight and installation, and are not copied into a new scaffold. Secrets are never requested or generated by Next Hydra; registry `envVars` remain suitable only for safe placeholders or development defaults.

## Current limits

- The official registry requires CMS. Auth is optional; Commerce requires Auth. A source catalog must include the shared `app-web` item.
- A scaffolded Customer Workspace has no composition receipt and cannot be automatically upgraded or switched later.
- Composition installs local code and JavaScript dependencies. Remote service setup, real secrets, Composer changes, Drupal module enablement, and deployed extensions remain manual.
- Selection Definitions are declarative and cannot run arbitrary hooks.
