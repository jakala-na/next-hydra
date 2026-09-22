# Named workspaces

The architecture and its ownership boundaries are recorded in [ADR-0010: Compose Named Workspaces for Development and Deployment](../docs/adr/0010-compose-named-workspaces-for-development-and-deployment.md).

These named definitions, their `.gitignore` files, `tasks/` metadata and app-local Vercel settings are source-controlled. Their materialized apps, packages, dependencies, local state and credentials are not. The same folders serve development and deployment. After cloning, install the source checkout's dependencies, then initialize one workspace or all four:

```sh
pnpm --filter create-next-hydra compose cms-contentstack --copy-env
pnpm --filter create-next-hydra compose --all --copy-env
pnpm --dir workspaces/cms-contentstack dev
```

The same command updates an existing workspace. All application files are physical copies. The shared web application is implicit in every definition. CMS is required; Auth and Commerce are optional, but Commerce requires Auth and includes the complete storefront, checkout, API and admin. Packages bring composition recipes through registry dependencies; their slot bindings extend shared templates. Recipes can build on other recipes without splitting Commerce into selectable shopping features. Provisioning recipes configure external services separately and are never executed by composition.

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

Ordinary source files, including provider routes, are copied into the selected workspace. Use `--explain <file>` when you need to find their canonical sources, edit there, then refresh. Workspace edits never change canonical source automatically. Each workspace has its own physical manifests and `node_modules`, so pnpm resolves its selected aliases and source-only packages without building or publishing them. The source checkout still needs its own dependencies installed for source tooling.

Composed files such as the web layout remain physical. Edit their templates and refresh; don't author a second implementation in the output:

```sh
pnpm --filter create-next-hydra compose cms-contentstack
pnpm --filter create-next-hydra compose --all --check
pnpm --filter create-next-hydra compose cms-contentstack --watch
pnpm --filter create-next-hydra compose cms-contentstack --explain 'apps/web/app/[locale]/layout.tsx'
pnpm --filter create-next-hydra compose storefront-drupal --explain packages/cms-drupal/components/component-registry.ts
```

Refresh prepares the actual registry composition in isolation, preflights all owned files, then applies changes. Template-only edits do not reinstall dependencies. Changed dependency inputs or missing `node_modules` require an install; `--no-install` leaves that work pending, and `--offline` uses the local pnpm store. The watcher never runs a dependency install after its initial run; it tells you when to rerun the command. External CMS/search provisioning is a separate operation, never an initialization/update side effect.

`--explain <workspace-relative-file>` is read-only: it shows the selected registry owner, absolute canonical source/template path, and the source to edit before refreshing. It also works before initialization. Applied state retains this provenance, and conflict reports include the edit location. The watcher tracks additions, edits, renames and deletions in selected source trees, along with registry files, templates and dependency inputs. It excludes dependencies, caches, ignored output and local environment files. New registry-owned files still require registration; watching does not infer ownership.

### Inspect workspace changes

All workspaces use physical copies so imports and dependency resolution match scaffolded projects. The authoring commands are:

```sh
pnpm --filter create-next-hydra compose storefront-contentstack
# Locate one file's canonical source or template:
pnpm --filter create-next-hydra compose storefront-contentstack --explain 'apps/web/app/[locale]/layout.tsx'
# Composition-wide audit only: list every selected file and its edit location:
pnpm --filter create-next-hydra compose storefront-contentstack --explain
# Local edits, deletions, unregistered files and patches:
pnpm --filter create-next-hydra compose storefront-contentstack --diff
# After editing canonical source, refresh physical output automatically:
pnpm --filter create-next-hydra compose storefront-contentstack --watch
```

Each successful composition saves its approved files in a private bare Git repository under the source checkout's ignored `.cache/workspace-snapshots/` directory. Applied workspace state records the snapshot commit. There is no `.git` directory or pointer inside the application, no remote, and no change to the source repository's index or history. Unchanged compositions reuse the same commit. `--no-install` also records materialized files; a snapshot does not certify that dependencies, type checking or builds succeeded.

`--diff` compares physical output with that saved snapshot, without composing or advancing it. It reports existing files as modified or deleted and includes their Git patches and source ownership. New files are found independently of `.gitignore`, listed as unregistered, and never automatically staged or copied back. Their contents are not included in patches. Environment files, known credential paths, dependency directories and build caches are excluded; this is not a general-purpose secret scanner. Workspace-owned definitions, settings and task metadata remain visible through the source repository's ordinary Git status.

For agent-driven editing, use the known canonical path or search source first. When ownership is unclear, use `--explain <workspace-relative-file>` for that file; reserve the full inventory for composition-wide audits and filter it before loading it into context. Edit canonical implementations or templates, then refresh. If experimenting directly in physical output, use `--diff` to reconcile changes manually into the indicated source or template. Move new files into canonical source and register their targets before refreshing. Template output cannot be automatically reversed into its inputs. Refresh refuses conflicting local edits and unregistered files; there is no force-overwrite or automatic adoption. A cleared snapshot cache can be rebuilt by composition only after ownership checks pass.

These snapshots are local inspection history, not a backup of unregistered work. They are never included in newly scaffolded projects. `--check` still answers whether the current definition and source require refresh; `--diff` answers what changed locally since the last composition snapshot.

`--check` reports stale output, missing workspace ignore files, modified/deleted managed files, unregistered files and pending dependency installation, and exits nonzero if any need attention. `--all` processes each named definition independently and reports failures without preventing the others from updating. Definitions must be direct children of `workspaces/` and visible to Git (tracked or new); explicitly ignored definitions and nested scratch definitions are not discovered. Next, SWC and Workflow build artifacts are excluded from unregistered-file reports.

### Freshness before application verification

These checks answer different questions:

| Command | What it establishes |
| --- | --- |
| `compose <name> --explain <file>` | Which canonical source or template owns an application file. |
| `compose <name> --check` | Whether the selected workspace needs refresh, reconciliation or dependency installation against the current definition and source. This is the application freshness gate. |
| `compose <name> --diff` | Which workspace files changed locally since the last composition snapshot. It prints diagnostics and patches; a successful exit or an empty diff does not certify source freshness. |
| Root `pnpm workspace:check` | Whether committed task metadata and outer lockfile compatibility are current. It does not certify the materialized application. |

After editing canonical source, refresh the workspace and check immediately before running application tests or inspecting its browser UI. For example, from the repository root:

```sh
pnpm --filter create-next-hydra compose storefront-contentstack
pnpm --filter create-next-hydra compose storefront-contentstack --check
pnpm --dir workspaces/storefront-contentstack --filter web test
```

If refresh or check reports local changes, inspect `compose storefront-contentstack --diff` and use the source mappings to reconcile them before retrying. Preserve unregistered work. A clean snapshot diff can coexist with stale application copies when only canonical source changed. Newly added source files must also be covered by registry ownership; use `pnpm registry:check` when changing that inventory.

Root `pnpm dev` refreshes once before starting the reference applications. For subsequent edits, refresh explicitly or run `compose <name> --watch` separately. Wait for an in-progress refresh to finish before checking; a lock failure is not a passing check. A watcher can report conflicts or pending installation, so its presence does not replace the gate. `--no-install` is only appropriate when the workspace dependencies are already current.

Passing the gate describes files on disk. Confirm the resolved server URL belongs to that workspace and allow development compilation to finish. Restart or rebuild when needed for configuration, dependency or runtime changes. If relevant source or output changes during verification, refresh and repeat affected checks; a previous pass does not cover later edits. See the [E2E guide](../docs/agents/e2e.md#freshness-before-application-verification) for the browser-suite workflow and the limits of current enforcement.

## Run and verify the composition

Packages own their environment schemas in `keys.ts`; applications aggregate the selected packages' validators in `env.ts`. The Commerce API's `next.config.ts` imports `env.ts`, validating Auth (including admin and webhook settings), Commerce, Email, Payments and registration settings when Next loads the application configuration. Provider aliases determine which credentials are required: a WorkOS composition does not require Clerk credentials. Lazy service validation provides additional checks when services initialize; there is no separate environment-validation startup hook.

The root checkout is source-only, not a runnable storefront. Root `pnpm dev` initializes and runs `storefront-contentstack` (copying only missing env files). Root `pnpm test` separates three responsibilities:

- Package/domain tests and provider contract suites run once from canonical source. The shared invitation lifecycle contract belongs to Registration and is exercised by both Clerk and WorkOS in their own test suites.
- Registry/planner/template/materialization tests live in `create-next-hydra` and check supported selections without repeating domain suites in every workspace.
- Common application integration tests remain beside the web/API/admin/CLI source, but run only inside `storefront-contentstack`, pinned to WorkOS, Contentstack and commercetools. The runner refreshes and installs that definition first, verifies the selected provider aliases and installed links, and runs app tasks without rerunning their package dependencies. It never falls back to the root apps. The E2E runner's own helper tests also run once from their source package; live browser scenarios remain a separate `pnpm test:e2e` command.

Root `pnpm typecheck` and `pnpm build` still cover all named definitions. Application checks need a composition's layouts, CMS block maps, provider aliases and dependencies. Open a named workspace in your editor for that complete TypeScript context; use `--explain <file>` when the canonical edit location is unclear. Neither app tests nor provider tests are copied into a new root-level test collection.

```sh
pnpm --filter create-next-hydra compose cms-contentstack --run typecheck
pnpm --filter create-next-hydra compose storefront-drupal --copy-env --run dev
# Optional broader diagnostic, not the default test policy:
pnpm --filter create-next-hydra compose --all --run test
# After refresh and a passing compose --check, run a focused application task.
pnpm --dir workspaces/storefront-contentstack --filter web test
pnpm --dir workspaces/storefront-contentstack --filter cli cli --help
```

`--run` refreshes and installs first, then runs `dev`, `build`, `test` or `typecheck`. It does not perform remote provisioning. Development runs require one named workspace; finite tasks may use `--all` and report failures independently. Tests resolve physical sources and provider aliases within the selected workspace, just as in a scaffolded project. Build/type checks still require valid credentials and provider schemas; composition does not regenerate remote schemas or fix domain-code failures.

Run provider administration or specialized app tasks explicitly from a named workspace. Do not run app-local scripts against the root authoring directories.

Development, deployment and scaffolded workspaces use the same Turbo task configuration. Explicit source inputs include physical files below ignored workspace folders; caches and build outputs are excluded. Refresh after canonical source edits, or keep `compose <name> --watch` running, before invoking application tasks. Environment-variable names come from selected examples/defaults; keep these or explicit task declarations current as build inputs evolve.

## Lint verification

`pnpm lint` checks source and rendered code using all named definitions. The commit hook formats staged files, then runs `pnpm --filter create-next-hydra lint:staged`. For a focused check after building the CLI:

```sh
node packages/create-next-hydra/dist/lint-workspaces.js packages/cms-contentstack/components/component-renderer.tsx
```

Composition-dependent sources are checked in disposable physical copies produced by the same materializer, with each selection's own installed dependency graph. Existing development workspaces are never refreshed by lint. Verification does not copy credentials, run development servers, or provision remote systems. Dependency installation may need package-registry access.

Each snapshot loads the repository's actual lint configuration, preserving app/package-relative overrides and custom rules. It checks rendered templates as well as the requested source files. Shared configuration still excludes vendor/codegen files; after that source filtering, missing file coverage is an error. Compiler diagnostics are enabled alongside lint, so unresolved imports cannot masquerade as successful checks. Diagnostics identify the canonical implementation or the template and its rendered target; line numbers for templates refer to their rendered output.

Before linting, Next generates route types from the snapshot's actual web route tree using the shared base configuration, without loading provider credentials. The complete composed Next configuration is restored before linting. This verifies route-shape types (including `next/root-params`); it is not a provider configuration or production build check.

Source files not installed in any named definition are linted in the source checkout. Uncovered web/API files and requested templates fail explicitly instead of falling back to the incomplete root app. Add a named definition when introducing a new composition that needs verification. Snapshots are removed after each check, including failures, and verification caching is disabled. `lint:staged` selects paths from the index but checks current working-tree content, like other local development checks; unrelated unstaged changes should be kept separate when verifying a commit.

Commerce also owns installation of the design system's Commerce components and cart button. They stay in their existing source package but are absent from CMS-only output; Commerce itself is still installed whole. The Commerce boundary check scans the composed filesystem, rather than an empty Git inventory in the ignored workspace.

## Safety and reconciliation

- Refresh refuses to overwrite local edits, deleted managed files, redirected symlinks or unknown files occupying an intended target. No force flag bypasses this. Reconcile intended edits into their canonical source/template first.
- New files in a development workspace are reported as unregistered and are never deleted. Move them to canonical source, register their target/owner, then refresh to install the file. Automatic adoption is not implemented.
- Provider removal deletes unchanged owned files only; it never recursively removes a package directory or follows a symlink into source. Unknown files in an unselected package are preserved and reported; reconcile them explicitly.
- `--copy-env` copies only missing ignored env files for installed paths, with private permissions. Existing files remain untouched; symlinked env paths are rejected. Secret values are never logged or stored in the ownership state.
- Updates have an exclusive local lock and atomic per-file writes. Interrupted updates retain before/after fingerprints for retry. After an abrupt process termination, verify that its recorded PID is no longer running before removing `.workspace-update.lock`; then rerun the same command. Failed installs can be retried without recreating the workspace.
- Do not edit physical composed files or run another package install during a refresh. The lock serializes composition commands, not editors or arbitrary processes; preflight checks are not a filesystem sandbox.

Before initialization a named directory may contain its `next-hydra.json`, root and `apps/<app>/.gitignore` files, optional `README.md`, regular `apps/<app>/vercel.json` settings, `tasks/package.json`, `tasks/turbo.json` and restored caches. Settings are not registry-owned: named composition omits customer ignore and Vercel defaults, preserves independently authored settings, and refuses deployment settings for unselected apps. App-local ignore rules remain preserved even when their app is no longer selected. Do not delete a workspace containing unregistered files. Ignoring output in Git is not a backup for new authoring work. Refresh refuses unregistered files; `--check` reports them without changing files.

New workspace files are visible as untracked files by default; there is no parent ignore policy hiding workspace folders. Add `workspaces/<name>/next-hydra.json`, then run `compose <name>`. Compose creates a workspace-local `.gitignore` only if it is missing. The default exposes the definition, root/app `.gitignore` files, README, task metadata and app deployment settings while ignoring materialized application source, manifests and local state. Repository-wide secret, dependency and cache exclusions still apply. Commit the definition and the settings you want to maintain.

Each workspace owns that ignore policy. Edit it before or after initialization, or provide an empty file to decline the default. Compose preserves it, including local edits; `--check` reports a missing root file without creating it. App-local `.gitignore` files are preserved settings, not unregistered code, including files written by tools to ignore caches such as `.swc`. `--diff` excludes these settings and `--explain` identifies their workspace ownership. Existing root ignore rules are never rewritten automatically; add `!/apps/*/.gitignore` to their app allowlist if you want to commit app-local settings. New source files inside ignored application directories still need `compose --check` and reconciliation into canonical source: Git visibility is not an ownership or backup mechanism.

Use stable named workspaces for ongoing development. Disposable verification should allocate unique temporary directories and remove them in `finally` or test teardown, not accumulate numbered workspace copies. Task-metadata staging and copied customer fixtures use the system temp directory. Lint snapshots stay below `workspaces/` to resolve maintainer tooling and use the same cleanup discipline.

The source checkout holds ordinary app implementations, authoring manifests, templates and provider-owned routes in their canonical registry locations. Project creation acquires the requested source revision in a temporary directory and uses the same workspace constructor as named `compose`. Source acquisition, credentials, Git initialization and refresh lifecycle differ; application selection and materialization do not. Scaffolded projects own ordinary copied files and do not retain this update contract or the root maintainer task routing.

## Deploy a composed application

The application must be materialized before it is built. The hosting service does that directly from its Git checkout, in the same named folder used for development:

```sh
pnpm --filter create-next-hydra compose storefront-contentstack
pnpm --dir workspaces/storefront-contentstack exec turbo run build --filter=web
```

Hosting builds materialize the named workspace from its Git checkout, preserving restored caches. `--no-install` separates materialization from dependency installation. Ignored source credentials are copied only with explicit `--copy-env`, which is intended for local development, not hosted builds. Existing destination environment files are preserved. Portless uses dynamically allocated ports unless the named definition sets `development.port`.

### Vercel Git deployments

Keep the existing Vercel projects and Git connections. Each project points at its app inside the selected named workspace. These directories exist in Git because they contain committed `vercel.json` files:

| Project | Root Directory |
| --- | --- |
| Contentstack CMS site | `workspaces/cms-contentstack/apps/web` |
| Drupal CMS site | `workspaces/cms-drupal/apps/web` |
| Contentstack storefront web/API/admin | `workspaces/storefront-contentstack/apps/web`, `apps/api`, or `apps/admin` under that same workspace |
| Drupal storefront web/API/admin | `workspaces/storefront-drupal/apps/web`, `apps/api`, or `apps/admin` under that same workspace |

Set Root Directory and enable access to files outside it in Vercel. Use Node 24 and the repository's pinned pnpm. Keep Vercel's automatic unaffected-project skipping disabled: before composition, the app's generated package graph is absent. The committed ignored-build command instead queries the outer composition task through Turbo before application installation. It needs Node 24, Git and Turbo (or npm to obtain the pinned executable), not installed application packages or materialized apps.

The app's committed configuration explicitly selects Next.js and provides:

1. **Install Command:** install source tooling, compose that workspace, and install the selected dependency graph.
2. **Build Command:** run `turbo run build --filter=<app>` from the composed workspace, with the local cache under `node_modules/.cache/turbo`.
3. **Output Directory:** `.next`, directly beneath this app. No parent-relative output redirection or canonical-app stand-in is needed.

Composition itself does not require Next.js. Vercel's builder resolves Next after its Install Command but before its Build Command, so composition and dependency installation belong in the Install Command. The actual composed app supplies Next at that point. See the [builder's installation order](https://github.com/vercel/vercel/blob/c628be7835e03a965b93e9cf9e2bd5ac2acbf5eb/packages/next/src/index.ts). The source root's build command exercises all definitions; the hosted project builds only its selected app.

Preview and production remain Git-triggered, with credentials and hosted URLs in Vercel. Each project has an isolated build checkout. Drupal-backed web follows the same path; Drupal's PHP backend is deployed separately. No command here changes hosted project settings or deploys through the Vercel CLI.

### Skip unaffected compositions

Each named workspace commits `tasks/package.json` and `tasks/turbo.json`. The outer pnpm workspace discovers these small task packages before application materialization. Their native Turbo inputs come from the actual constructor's selected sources, templates, assets, patches and package dependency closure. There is no separate deployment inventory or custom changed-file matcher. After changing definitions, registry metadata or dependency membership, synchronize the task files and commit the result:

```sh
pnpm workspace:sync
pnpm workspace:check
```

Registry integrity CI checks freshness; stale task metadata must not be merged. Synchronization uses disposable composition staging, then runs `pnpm install --lockfile-only --ignore-scripts --no-frozen-lockfile` at the source root. This updates the outer lockfile, including new workspace package entries, without installing dependencies, running lifecycle scripts, copying credentials or changing the named application. Commit the task files and `pnpm-lock.yaml` together. If resolution fails, the task files remain available for inspection; rerunning synchronization retries the lockfile even if those files are already current. `workspace:check` also validates the lockfile in frozen, offline mode without repairing it. Ordinary implementation edits within an existing selected package do not require synchronization. Detection is deliberately whole-composition and package-granular: a selected package's new files, removals and tests count, even if only part of that package is rendered. Web, API and admin deployments of the same composition share the decision. Drupal source edits skip Contentstack compositions; Commerce source edits skip CMS-only compositions; maintainer CLI test edits skip application deployments. The GitHub registry tests still run.

The ignore script runs `turbo query affected --tasks build --packages @workspaces/<name>` from the outer repository root, comparing the current commit with `VERCEL_GIT_PREVIOUS_SHA`. It never substitutes the parent commit or `main`. Turbo matches task inputs and propagates task dependencies. Missing or divergent history, unavailable Turbo, missing/invalid task metadata and unresolved external sources allow a build. Input membership freshness is enforced by CI, not reconstructed by the deployment script. Configuration changes build conservatively even if synchronized metadata accompanies them. Skipping cancels the build before application dependency installation; it does not prevent Vercel from creating the deployment attempt.

For environment changes, refreshed external CMS content, or troubleshooting, redeploy with Vercel's **Use project's Ignore Build Step** option unchecked, or set `VERCEL_FORCE_BUILD=1`. Same-commit redeploys are also allowed. `[skip ci]` remains supported, with the force setting taking precedence; do not use it when you need GitHub CI to run.

The gate uses Turbo 2.10.13: an available matching executable, or `npx --yes turbo@2.10.13` before project installation. The application configuration is shared unchanged between customer and named workspace outputs and enables task-input-aware affected execution. CLI compilation/typechecking exclude maintainer tests while including compiler configuration. Composition itself is uncached: it must reconcile selected files, ownership and restored dependencies. The application Build Command remains an ordinary filtered build so cache hits restore required output files rather than omitting tasks. The outer task directory avoids conflicting with the inner application's standalone `turbo.json`; it is never included in customer output.

These committed files are maintainer settings, not registry sources. Customer scaffolds retain the original app-local `vercel.json` files and skip-CI scripts from the registry. They do not receive the maintainer composition commands, cache-location settings or maintainer ignore script. For example, the customer web and API defaults remain:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "ignoreCommand": "node scripts/skip-ci.js"
}
```

Admin uses the same configuration with `scripts/skip-ci.mjs`. Customers can continue configuring builds in the dashboard or customize their own files; composition adds no maintainer deployment instructions to them.

### Cache reuse and refresh safety

Workspace-owned settings remain editable physical files. Commit deployment commands and ignore rules alongside the workspace definition; composition preserves them. Redirected settings paths block refresh.

`compose <name>` uses ownership-aware updates: unchanged source is not rewritten, changed templates and files are refreshed, and unchanged files no longer selected are removed. It never clears the workspace or its cache directories. Next's `.next/cache`, package `node_modules` and Turbo artifacts stay in place. Dependency installation runs when selected dependency inputs change, dependencies are missing, or installation needs retry.

On a clean hosted checkout, the committed settings may coexist with restored caches but no ownership state. This is accepted; arbitrary preexisting source is not. Installation still runs to reconcile restored dependencies when state is absent. Later refreshes retain `.workspace-composition.json` for conflict detection and interrupted-update recovery. Edited/deleted managed files, unregistered files and redirected cache roots block refresh. Customer Git repositories cannot be converted into named workspaces.

Application task configuration is shared with customer creation, including environment inputs, dependency ordering, source hashing and output declarations. The Vercel build invocation selects `node_modules/.cache/turbo` so its local Turbo cache sits inside the restored dependency-cache tree. This changes cache location, not `turbo.json` or cache correctness. Remote-cache environment is passed through unchanged. Next's incremental compiler cache is preserved separately from Turbo's complete build-output cache.

Environment variable names from the selected `.env.example` files and registry defaults, plus public Next variables and the standard build environment, participate in Turbo's cache keys. Values are not written into composition state or generated configuration. This is conservative across the selected workspace; maintainers must keep examples/defaults or explicit Turbo `env` declarations current when adding build-affecting variables. Composition does not copy ignored local credentials into hosted builds.

Before changing production settings, verify a Git-triggered preview and a subsequent cached rebuild, including server routes, static assets and provider-specific handlers. Local composition/cache checks do not validate the hosted builder, external credentials or provider services. Stable named paths allow subsequent builds to reuse caches.

No hosted project settings are changed by composition. General references: [Vercel build configuration](https://vercel.com/docs/builds/configure-a-build), [Vercel monorepos](https://vercel.com/docs/monorepos).

## Browser tests

Every composed web workspace receives the same project-level E2E runner delivered to customers. Run `pnpm --dir workspaces/<name> test:e2e` inside its dependency graph, or delegate from the maintainer root with `pnpm test:e2e --filter=@workspaces/<name>`. The latter uses derived workspace task metadata and forwards Playwright arguments after `--`. It does not materialize or refresh the workspace implicitly.

Refresh and check freshness first using the workflow above. `pnpm --dir workspaces/<name> test:e2e:list` lists available scenarios. CMS-only workspaces currently report zero supplied browser tests; commerce workspaces include the selected company, registration and checkout scenarios. Fixture imports and scenario discovery resolve entirely inside the composition.
