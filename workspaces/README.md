# Development workspaces

These named definitions are source-controlled. Their installed apps, packages, dependencies, local state and credentials are not. After cloning, install the source checkout's dependencies, then initialize one workspace or all four:

```sh
pnpm --filter create-next-hydra compose cms-contentstack --copy-env
pnpm --filter create-next-hydra compose --all --copy-env
pnpm --dir workspaces/cms-contentstack dev
```

The same command updates an existing workspace. There is no separate init/update mode and no web-app/profile selection. CMS is required; Auth and Commerce are optional, but Commerce requires Auth and includes the complete storefront, checkout, API and admin. Packages extend the shared web templates through their registry metadata.

| Name | Selection | Web hostname |
| --- | --- | --- |
| cms-contentstack | Contentstack | web.cms-contentstack.localhost |
| cms-drupal | Drupal | web.cms-drupal.localhost |
| storefront-contentstack | Contentstack, WorkOS, commercetools, navigation search | web.storefront-contentstack.localhost |
| storefront-drupal | Drupal, Clerk, commercetools, navigation search | web.storefront-drupal.localhost |

The folder name determines the stable Portless name for each installed Next app: `<app>.<workspace>.localhost`. API/admin use `api.<workspace>.localhost` and `admin.<workspace>.localhost`; a CMS-only selection does not install these apps. Portless adds the Git worktree's branch prefix when applicable, so separate checkouts do not fight over the same host. Check the actual URL without starting a server with `pnpm --dir workspaces/cms-contentstack exec portless get web.cms-contentstack`.

Do **not** commit generated `package.json` files to customize these names. Composition writes each app's Portless config and scripts and includes the source checkout's pinned Portless dependency. Refresh reproduces them. The four definitions need no host or port settings. Names must be DNS labels (1–63 lowercase letters, numbers and hyphens; no leading/trailing hyphen). Optional `development.port` fixes the internal web port, with API/admin on the next two ports; normally Portless allocates these automatically. `pnpm run dev:app` in an app bypasses Portless when troubleshooting.

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

Linked-workspace build, test and typecheck tasks deliberately disable Turbo caching: ignored output and source symlinks must not produce false cache hits when canonical code changes. Ordinary copied customer output retains normal caching.

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

Only `next-hydra.json` and an optional `README.md` belong in a new definition directory before initialization. Do not delete a workspace containing unregistered files. Ignoring output in Git is not a backup for new authoring work.

`use` has been removed: the source checkout is no longer switched in place. The 11 template outputs and duplicate provider-owned routes have been retired from the root checkout. Ordinary app implementations and authoring manifests remain source. Default customer creation still clones the repository baseline and applies the shared registry planner and renderer; named `compose` materializes directly from local source and safely refreshes it. Customer scaffolds own ordinary copied files and do not retain this update contract or the root maintainer task routing.

Deployment projects previously rooted directly at the source checkout's `apps/web` must now build a materialized workspace (or a separately scaffolded customer project). Changing hosted project settings is not performed by composition.
