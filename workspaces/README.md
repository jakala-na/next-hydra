# Named workspaces

The architecture and its ownership boundaries are recorded in [ADR-0010: Compose Named Workspaces for Development and Deployment](../docs/adr/0010-compose-named-workspaces-for-development-and-deployment.md).

These named definitions and their app-local Vercel settings are source-controlled. Their materialized apps, packages, dependencies, local state and credentials are not. The same folders serve development and deployment. After cloning, install the source checkout's dependencies, then initialize one workspace or all four:

```sh
pnpm --filter create-next-hydra compose cms-contentstack --copy-env
pnpm --filter create-next-hydra compose --all --copy-env
pnpm --dir workspaces/cms-contentstack dev
```

The same command updates an existing workspace. Add `--no-link` to materialize physical copies instead of source links, in the same folder with the same safe refresh lifecycle. No output/reuse mode or web-app/profile selection is needed. CMS is required; Auth and Commerce are optional, but Commerce requires Auth and includes the complete storefront, checkout, API and admin. Packages bring composition recipes through registry dependencies; their slot bindings extend shared templates. Recipes can build on other recipes without splitting Commerce into selectable shopping features. Provisioning recipes configure external services separately and are never executed by composition.

| Name | Selection | Web hostname |
| --- | --- | --- |
| cms-contentstack | Contentstack | web.cms-contentstack.localhost |
| cms-drupal | Drupal | web.cms-drupal.localhost |
| storefront-contentstack | Contentstack, WorkOS, commercetools, navigation search | web.storefront-contentstack.localhost |
| storefront-drupal | Drupal, WorkOS, commercetools, navigation search | web.storefront-drupal.localhost |

The folder name determines the stable Portless name for each installed Next app: `<app>.<workspace>.localhost`. API/admin use `api.<workspace>.localhost` and `admin.<workspace>.localhost`; a CMS-only selection does not install these apps. Portless adds the Git worktree's branch prefix when applicable, so separate checkouts do not fight over the same host. Check the actual URL without starting a server with `pnpm --dir workspaces/cms-contentstack exec portless get web.cms-contentstack`.

Do **not** commit generated `package.json` files to customize these names. Composition names apps that explicitly declare Portless configuration and includes the source checkout's pinned Portless dependency. It preserves package-owned build, test, typecheck, start and development commands; external apps without Portless configuration keep their scripts unchanged. Copied customer output also keeps Portless, using the sanitized customer project name for its hosts. The four definitions need no host or port settings. Names must be DNS labels (1–63 lowercase letters, numbers and hyphens; no leading/trailing hyphen). Optional `development.port` fixes the internal web port, with API/admin on the next two ports; normally Portless allocates these automatically. `pnpm run dev:app` in an app bypasses Portless when troubleshooting.

The existing Portless environment adapter derives sibling app URLs and local auth callbacks from the actual `PORTLESS_URL`, preserving worktree prefixes, scheme and proxy port. It changes the process environment, not copied credential files. `PORTLESS_AUTO_ENV=0` keeps explicit URLs for mixed local/remote development. Remote authentication callback allowlists still need configuration; copying credentials does not update provider dashboards. Portless may require a one-time local proxy/certificate setup before the first dev run. Drupal's backend remains governed by its own DDEV configuration, not these Next-app hostnames.

## Author and refresh

Ordinary source files, including provider routes, are file-symlinked to their canonical sources. Edit them in either location. Each workspace has its own physical manifests and `node_modules`, so pnpm resolves its selected aliases and source-only packages without building or publishing them. The source checkout still needs its own dependencies installed for source tooling.

Composed files such as the web layout remain physical. Edit their templates and refresh; don't author a second implementation in the output:

```sh
pnpm --filter create-next-hydra compose cms-contentstack
pnpm --filter create-next-hydra compose --all --check
pnpm --filter create-next-hydra compose cms-contentstack --watch
pnpm --filter create-next-hydra compose cms-contentstack --explain 'apps/web/app/[locale]/layout.tsx'
pnpm --filter create-next-hydra compose storefront-drupal --explain packages/cms-drupal/components/component-registry.ts
```

Refresh prepares the actual registry composition in isolation, preflights all owned files, then applies changes. Template-only edits do not reinstall dependencies. Changed dependency inputs or missing `node_modules` require an install; `--no-install` leaves that work pending, and `--offline` uses the local pnpm store. The watcher never runs a dependency install after its initial run; it tells you when to rerun the command. External CMS/search provisioning is a separate operation, never an initialization/update side effect.

`--explain <workspace-relative-file>` is read-only: it shows the selected registry owner, absolute canonical source/template path, and whether edits are live-linked or require refresh. It also works before initialization. Applied state retains this provenance, and conflict reports include the edit location. Old version-2 state gains provenance on the next refresh without rewriting unchanged files. The watcher also tracks physical copy exceptions such as app-local test configuration.

`--check` reports stale output, modified/deleted managed files, unregistered files and pending dependency installation, and exits nonzero if any need attention. `--all` processes each named definition independently and reports failures without preventing the others from updating. Definitions must be direct children of `workspaces/` and visible to Git (tracked or new); ignored legacy scratch output and nested scratch definitions are not discovered. Next, SWC and Workflow build artifacts are excluded from unregistered-file reports.

## Run and verify the composition

The root checkout is source-only, not a runnable storefront. Root `pnpm dev` initializes and runs `storefront-contentstack` (copying only missing env files). Root `pnpm test` separates three responsibilities:

- Package/domain tests and provider contract suites run once from canonical source. The shared invitation lifecycle contract belongs to Registration and is exercised by both Clerk and WorkOS in their own test suites.
- Registry/planner/template/materialization tests live in `create-next-hydra` and check supported selections without repeating domain suites in every workspace.
- Common application integration tests remain beside the web/API/admin/CLI source, but run only inside `storefront-contentstack`, pinned to WorkOS, Contentstack and commercetools. The runner refreshes and installs that definition first, verifies the selected provider aliases and installed links, and runs app tasks without rerunning their package dependencies. It never falls back to the root apps. The E2E runner's own helper tests also run once from their source package; live browser scenarios remain a separate `pnpm test:e2e` command.

Root `pnpm typecheck` and `pnpm build` still cover all named definitions. Application checks need a composition's layouts, CMS block maps, provider aliases and dependencies. Open a named workspace in your editor for that complete TypeScript context; linked implementations still edit canonical source. Neither app tests nor provider tests are copied into a new root-level test collection.

```sh
pnpm --filter create-next-hydra compose cms-contentstack --run typecheck
pnpm --filter create-next-hydra compose storefront-drupal --copy-env --run dev
# Optional broader diagnostic, not the default test policy:
pnpm --filter create-next-hydra compose --all --run test
# Already initialized: run a focused package task without another refresh.
pnpm --dir workspaces/storefront-contentstack --filter web test
pnpm --dir workspaces/storefront-contentstack --filter cli cli --help
```

`--run` refreshes and installs first, then runs `dev`, `build`, `test` or `typecheck`. It does not perform remote provisioning. Development runs require one named workspace; finite tasks may use `--all` and report failures independently. Tests preserve source symlinks so relative imports and provider aliases resolve within the selected workspace. Build/type checks still require valid credentials and provider schemas; composition does not regenerate remote schemas or fix domain-code failures.

Root `cli`, `analyze`, `dev:without-api` and `dev:api:public` shortcuts have been retired; run provider administration or specialized app tasks explicitly from a named workspace. Do not run app-local scripts against the root authoring directories.

Linked development, copied deployment and customer workspaces use the same Turbo task configuration. Explicit source inputs include files below ignored workspace folders and hash linked file contents; caches and build outputs are excluded. Source edits do not require recomposition to invalidate a linked task's cache. Environment-variable names come from selected examples/defaults; keep these or explicit task declarations current as build inputs evolve.

## Lint verification

`pnpm lint` checks source and rendered code using all named definitions. The commit hook formats staged files, then runs `pnpm --filter create-next-hydra lint:staged`. For a focused check after building the CLI:

```sh
node packages/create-next-hydra/dist/lint-workspaces.js packages/cms-contentstack/components/component-renderer.tsx
```

Composition-dependent sources are checked in disposable physical copies produced by the same materializer, with each selection's own installed dependency graph. Development workspaces keep their source links and are never refreshed by lint. Verification does not copy credentials, run development servers, or provision remote systems. Dependency installation may need package-registry access.

Each snapshot loads the repository's actual lint configuration, preserving app/package-relative overrides and custom rules. It checks rendered templates as well as the requested source files. Shared configuration still excludes vendor/codegen files; after that source filtering, missing file coverage is an error. Compiler diagnostics are enabled alongside lint, so unresolved imports cannot masquerade as successful checks. Diagnostics identify the canonical implementation or the template and its rendered target; line numbers for templates refer to their rendered output.

Before linting, Next generates route types from the snapshot's actual web route tree using the shared base configuration, without loading provider credentials. The complete composed Next configuration is restored before linting. This verifies route-shape types (including `next/root-params`); it is not a provider configuration or production build check.

Source files not installed in any named definition are linted in the source checkout. Uncovered web/API files and requested templates fail explicitly instead of falling back to the incomplete root app. Add a named definition when introducing a new composition that needs verification. Snapshots are removed after each check, including failures, and verification caching is disabled. `lint:staged` selects paths from the index but checks current working-tree content, like other local development checks; unrelated unstaged changes should be kept separate when verifying a commit.

Commerce also owns installation of the design system's Commerce components and cart button. They stay in their existing source package but are absent from CMS-only output; Commerce itself is still installed whole. The Commerce boundary check scans the composed filesystem, including source links, rather than an empty Git inventory in the ignored workspace.

## Safety and reconciliation

- Refresh refuses to overwrite local edits, deleted managed files, redirected symlinks or unknown files occupying an intended target. No force flag bypasses this. Reconcile intended edits into their canonical source/template first.
- New files in a development workspace are reported as unregistered and are never deleted. Move them to canonical source, register their target/owner, then refresh to install the link. Automatic adoption is not implemented.
- Provider removal unlinks owned files only; it never recursively removes a package directory or follows a symlink into source. Unknown files in an unselected package are preserved and reported; reconcile them explicitly.
- `--copy-env` copies only missing ignored env files for installed paths, with private permissions. Existing files remain untouched; symlinked env paths are rejected. Secret values are never logged or stored in the ownership state.
- Updates have an exclusive local lock and atomic per-file writes. Interrupted updates retain before/after fingerprints for retry. After an abrupt process termination, verify that its recorded PID is no longer running before removing `.workspace-update.lock`; then rerun the same command. Failed installs can be retried without recreating the workspace.
- Do not edit physical composed files or run another package install during a refresh. The lock serializes composition commands, not editors or arbitrary processes; preflight checks are not a filesystem sandbox.
- Earlier ad-hoc workspaces with version-1 receipts have no applied hashes and cannot be safely auto-adopted. Keep them intact and initialize a named workspace.

Before initialization a named directory may contain its `next-hydra.json`, optional `README.md`, regular `apps/<app>/vercel.json` settings and restored caches. Settings are not registry-owned: named composition omits registry Vercel defaults, preserves independently authored settings, and refuses settings for unselected apps. Do not delete a workspace containing unregistered files. Ignoring output in Git is not a backup for new authoring work. Copied refresh refuses unregistered files; `--check --no-link` reports them without changing files. Switching back to linking also protects locally edited physical copies.

Named workspaces materialize their own Git ignore files so only definitions, documentation and app deployment settings are visible to Git. These ignore files are physical maintainer metadata, not editable links to customer ignore rules; application source and `.env.example` files remain ignored. When adding deployment settings before the first composition, add the workspace's `apps/` exception to the source root's `.gitignore`, as shown for the four maintained definitions.

`use` has been removed: the source checkout is no longer switched in place. The 11 template outputs and duplicate provider-owned routes have been retired from the root checkout. Ordinary app implementations and authoring manifests remain source. Default customer creation acquires the requested source revision in a temporary directory and uses the same workspace constructor as named `compose`. Source acquisition, linking, credentials, Git initialization and refresh lifecycle differ; application selection and materialization do not. Customer scaffolds own ordinary copied files and do not retain this update contract or the root maintainer task routing.

## Deploy a composed application

The application must be materialized before it is built. The hosting service does that directly from its Git checkout, in the same named folder used for development:

```sh
pnpm --filter create-next-hydra compose storefront-contentstack --no-link
pnpm --dir workspaces/storefront-contentstack exec turbo run build --filter=web
```

There is no separate deployment output, upload workflow or extra repository. Refresh preserves caches automatically. `--no-install` separates materialization from dependency installation. Copied workspaces do not copy ignored source credentials or apply `development.port`; Portless stays available with normal dynamically allocated ports. Existing destination environment files are preserved, not removed. `--copy-env` is only for linked development.

### Vercel Git deployments

Keep the existing Vercel projects and Git connections. Each project points at its app inside the selected named workspace. These directories exist in Git because they contain committed `vercel.json` files:

| Project | Root Directory |
| --- | --- |
| Contentstack CMS site | `workspaces/cms-contentstack/apps/web` |
| Drupal CMS site | `workspaces/cms-drupal/apps/web` |
| Contentstack storefront web/API/admin | `workspaces/storefront-contentstack/apps/web`, `apps/api`, or `apps/admin` under that same workspace |
| Drupal storefront web/API/admin | `workspaces/storefront-drupal/apps/web`, `apps/api`, or `apps/admin` under that same workspace |

Set Root Directory and enable access to files outside it in Vercel. Use Node 24 and the repository's pinned pnpm. Disable automatic unaffected-project skipping: before composition, the app's generated package graph is absent, so it cannot reliably represent changes to canonical templates, registries and package sources. The committed ignored-build command still honors `[skip ci]` using a dependency-free maintainer script.

The app's committed configuration explicitly selects Next.js and provides:

1. **Install Command:** install source tooling, compose that workspace with `--no-link`, and install the selected dependency graph.
2. **Build Command:** run `turbo run build --filter=<app>` from the composed workspace, with the local cache under `node_modules/.cache/turbo`.
3. **Output Directory:** `.next`, directly beneath this app. No parent-relative output redirection or canonical-app stand-in is needed.

Composition itself does not require Next.js. Vercel's builder resolves Next after its Install Command but before its Build Command, so composition and dependency installation belong in the Install Command. The actual composed app supplies Next at that point. See the [builder's installation order](https://github.com/vercel/vercel/blob/c628be7835e03a965b93e9cf9e2bd5ac2acbf5eb/packages/next/src/index.ts). The source root's build command exercises all definitions; the hosted project builds only its selected app.

Preview and production remain Git-triggered, with credentials and hosted URLs in Vercel. Each project has an isolated build checkout. Drupal-backed web follows the same path; Drupal's PHP backend is deployed separately. No command here changes hosted project settings or deploys through the Vercel CLI.

These committed files are maintainer settings, not registry sources. Customer scaffolds retain the original app-local `vercel.json` files and skip-CI scripts from the registry. They do not receive the maintainer composition commands, cache-location settings or maintainer ignore script. For example, the customer web and API defaults remain:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "ignoreCommand": "node scripts/skip-ci.js"
}
```

Admin uses the same configuration with `scripts/skip-ci.mjs`. Customers can continue configuring builds in the dashboard or customize their own files; composition adds no maintainer deployment instructions to them.

### Cache reuse and refresh safety

When an existing version-2 workspace still owns a source-linked `vercel.json`, refresh detaches that unchanged link into a physical workspace-owned file, preserving its contents. `--check` reports the pending change without applying it. Unowned or redirected links remain blocked. This ownership migration does not replace the old settings with new deployment commands; review and commit the desired settings for that workspace.

`compose <name> --no-link` uses the same ownership-aware update engine as linked development: unchanged source is not rewritten, changed templates and files are refreshed, and retired owned files are removed. It never clears the workspace or its cache directories. Next's `.next/cache`, package `node_modules` and Turbo artifacts stay in place. Dependency installation runs when selected dependency inputs change, dependencies are missing, or installation needs retry. The `--reuse` and `--output` flags have been removed.

On a clean hosted checkout, the committed settings may coexist with restored caches but no ownership state. This is accepted; arbitrary preexisting source is not. Installation still runs to reconcile restored dependencies when state is absent. Later refreshes retain `.workspace-composition.json` for conflict detection and interrupted-update recovery. Edited/deleted managed files, unregistered files and redirected cache roots block copied refresh. Link/copy switching keeps the same directory and ownership contract. Customer Git repositories cannot be converted into named workspaces.

Application task configuration is shared with customer creation, including environment inputs, dependency ordering, source hashing and output declarations. The Vercel build invocation selects `node_modules/.cache/turbo` so its local Turbo cache sits inside the restored dependency-cache tree. This changes cache location, not `turbo.json` or cache correctness. Remote-cache environment is passed through unchanged. Next's incremental compiler cache is preserved separately from Turbo's complete build-output cache.

Environment variable names from the selected `.env.example` files and registry defaults, plus public Next variables and the standard build environment, participate in Turbo's cache keys. Values are not written into composition state or generated configuration. This is conservative across the selected workspace; maintainers must keep examples/defaults or explicit Turbo `env` declarations current when adding build-affecting variables. Composition does not copy ignored local credentials into hosted builds.

Before changing production settings, verify a Git-triggered preview and a subsequent cached rebuild, including server routes, static assets and provider-specific handlers. Local composition/cache checks do not validate the hosted builder, external credentials or provider services. Migrating project roots may cause an initial cache miss; subsequent builds use stable named paths. Old copied exports are left intact; reconcile any local work rather than deleting them as part of migration.

No hosted project settings are changed by composition. General references: [Vercel build configuration](https://vercel.com/docs/builds/configure-a-build), [Vercel monorepos](https://vercel.com/docs/monorepos).
