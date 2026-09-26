# Named workspaces

The architecture and its ownership boundaries are recorded in [ADR-0010: Compose Named Workspaces for Development and Deployment](../docs/adr/0010-compose-named-workspaces-for-development-and-deployment.md).

These named definitions, their `.gitignore` files, optional READMEs and app-local Vercel settings are source-controlled. Their materialized apps, packages, dependencies, local state and credentials are not. The same folders serve development and deployment. For local development after cloning, install the composition tooling, then initialize one workspace or all four:

```sh
pnpm --filter 'next-hydra...' --filter 'create-next-hydra...' install --frozen-lockfile
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

Refresh prepares the actual registry composition in isolation, preflights all owned files, then applies changes. Template-only edits do not reinstall dependencies. Changed dependency inputs or missing `node_modules` require an install; `--no-install` leaves that work pending, and `--offline` uses the local pnpm store. Watch serializes the same refresh and installation operation for each source change. Run the application's dev server separately. External CMS/search provisioning is a separate operation, never an initialization/update side effect.

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

`--diff` compares physical output with that saved snapshot, without composing or advancing it. It reports existing files as modified or deleted and includes their Git patches and source ownership. New files are found independently of `.gitignore`, listed as unregistered, and never automatically staged or copied back. Their contents are not included in patches. Environment files, known credential paths, dependency directories and build caches are excluded; this is not a general-purpose secret scanner. Workspace-owned definitions and settings remain visible through the source repository's ordinary Git status.

For agent-driven editing, use the known canonical path or search source first. When ownership is unclear, use `--explain <workspace-relative-file>` for that file; reserve the full inventory for composition-wide audits and filter it before loading it into context. Edit canonical implementations or templates, then refresh. If experimenting directly in physical output, use `--diff` to reconcile changes manually into the indicated source or template. New local files can stay in the workspace across refreshes. To include them in future compositions, move them into canonical source and register their targets, leaving the destination target free for its first managed installation. Template output cannot be automatically reversed into its inputs. Refresh refuses conflicting managed-file edits and collisions with new targets, not unrelated local files; there is no force-overwrite or automatic adoption. A cleared snapshot cache can be rebuilt by composition only after ownership checks pass.

These snapshots are local inspection history, not a backup of unregistered work. They are never included in newly scaffolded projects. `--check` still answers whether the current definition and source require refresh; `--diff` answers what changed locally since the last composition snapshot.

`--check` reports stale output, missing workspace ignore files, modified/deleted managed files, collisions at intended output paths and pending dependency installation, and exits nonzero if any need attention. Unrelated local files do not make a workspace stale. `--diff` can list eligible unowned files as informational; its exclusions are not a requirement for refresh. `--all` processes each named definition independently and reports failures without preventing the others from updating. Definitions must be direct children of `workspaces/` and visible to Git (tracked or new); explicitly ignored definitions and nested scratch definitions are not discovered.

### Freshness before application verification

These checks answer different questions:

| Command | What it establishes |
| --- | --- |
| `compose <name> --explain <file>` | Which canonical source or template owns an application file. |
| `compose <name> --check` | Whether the selected workspace needs refresh, reconciliation or dependency installation against the current definition and source. This is the application freshness gate. |
| `compose <name> --diff` | Which workspace files changed locally since the last composition snapshot. It prints diagnostics and patches; a successful exit or an empty diff does not certify source freshness. |

After editing canonical source, refresh the workspace and check immediately before running application tests or inspecting its browser UI. For example, from the repository root:

```sh
pnpm --filter create-next-hydra compose storefront-contentstack
pnpm --filter create-next-hydra compose storefront-contentstack --check
pnpm --dir workspaces/storefront-contentstack --filter web test
```

If refresh or check reports local changes, inspect `compose storefront-contentstack --diff` and use the source mappings to reconcile them before retrying. Preserve unregistered work. A clean snapshot diff can coexist with stale application copies when only canonical source changed. Newly added source files must also be covered by registry ownership; use `pnpm registry:check` when changing that inventory.

Application commands do not refresh source. Refresh explicitly or run `compose <name> --watch` separately. Wait for an in-progress refresh to finish before checking; a lock failure is not a passing check. A watcher can report conflicts or pending installation, so its presence does not replace the gate. `--no-install` is only appropriate when the workspace dependencies are already current.

Passing the gate describes files on disk. Confirm the resolved server URL belongs to that workspace and allow development compilation to finish. Restart or rebuild when needed for configuration, dependency or runtime changes. If relevant source or output changes during verification, refresh and repeat affected checks; a previous pass does not cover later edits. See the [E2E guide](../docs/agents/e2e.md#freshness-before-application-verification) for the browser-suite workflow and the limits of current enforcement.

## Run and verify the composition

Packages own their environment schemas in `keys.ts`; applications aggregate the selected packages' validators in `env.ts`. The Commerce API's `next.config.ts` imports `env.ts`, validating Auth (including admin and webhook settings), Commerce, Email, Payments and registration settings when Next loads the application configuration. Provider aliases determine which credentials are required: a WorkOS composition does not require Clerk credentials. Lazy service validation provides additional checks when services initialize; there is no separate environment-validation startup hook.

The root checkout is source-only, not a runnable storefront. Compose a named workspace, then run its own application commands. Root `pnpm test` separates three responsibilities:

- Package/domain tests and provider contract suites run once from canonical source. The shared invitation lifecycle contract belongs to Registration and is exercised by both Clerk and WorkOS in their own test suites.
- Registry/planner/template/materialization tests live in `create-next-hydra` and check supported selections without repeating domain suites in every workspace.
- Common application integration tests remain beside the web/API/admin/CLI source, but run only inside `storefront-contentstack`, pinned to WorkOS, Contentstack and commercetools. The runner refreshes and installs that definition first, verifies the selected provider aliases and installed links, and runs app tasks without rerunning their package dependencies. It never falls back to the root apps. The E2E runner's own helper tests also run once from their source package; live browser scenarios remain a separate `pnpm test:e2e` command.

Root `pnpm typecheck` and `pnpm build` check and build the composition CLI. Application checks run in the composed workspace and use its layouts, CMS block maps, provider aliases and dependencies. Open that workspace in your editor for the complete TypeScript context; use `--explain <file>` when the canonical edit location is unclear. Neither app tests nor provider tests are copied into a new root-level test collection.

```sh
pnpm --filter create-next-hydra compose cms-contentstack
pnpm --filter create-next-hydra compose cms-contentstack --check
pnpm --dir workspaces/cms-contentstack typecheck
# Local development:
pnpm --filter create-next-hydra compose storefront-drupal --copy-env
pnpm --dir workspaces/storefront-drupal dev
# Optional broader diagnostic, not the default test policy:
pnpm --filter create-next-hydra compose --all
pnpm --dir workspaces/storefront-drupal exec turbo run test
# After refresh and a passing compose --check, run a focused application task.
pnpm --dir workspaces/storefront-contentstack --filter web test
pnpm --dir workspaces/storefront-contentstack --filter cli cli --help
```

Compose materializes and installs the selected application; it does not run application tasks or remote provisioning. Run `dev`, `build`, `typecheck` and browser tests inside that application's own dependency graph, just as in a scaffolded project. For a single app, use `pnpm exec turbo run build --filter=<app>` from the composed root. Build/type checks still require valid credentials and provider schemas; composition does not regenerate remote schemas or fix domain-code failures.

Run provider administration or specialized app tasks explicitly from a named workspace. Do not run app-local scripts against the root authoring directories.

Development, deployment and scaffolded workspaces use the same Turbo task configuration. Explicit source inputs include physical files below ignored workspace folders; caches and build outputs are excluded. Refresh after canonical source edits, or keep `compose <name> --watch` running, before invoking application tasks. Environment-variable names come from selected environment examples; keep these or explicit task declarations current as build inputs evolve.

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

- Refresh refuses to overwrite local edits, deleted managed files or unknown files occupying an intended target. No force flag bypasses this. Reconcile intended edits into their canonical source/template first.
- Unowned files do not block initialization, refresh or `--check` unless they collide with intended output. `--diff` lists eligible paths for optional reconciliation; it never adopts or snapshots their contents. Keep scratch files locally, or move reusable code to canonical source and register its target for future compositions.
- Provider removal deletes unchanged owned files only; it never recursively removes a package directory. Unowned files in an unselected package remain in place.
- `--copy-env` copies only missing ignored env files for installed paths, with private permissions. Existing files remain untouched. Examples are documentation, not seeds for runtime env files. Secret values are never logged or stored in the ownership state.
- Updates have an exclusive local directory lock and atomic per-file writes. Interrupted updates retain before/after fingerprints for retry. If a lock remains, stop other Compose processes for the workspace and rerun Compose interactively to authorize archiving and breaking it. Breaking a lock does not stop processes or override conflicts. Do not delete lock files manually. Failed installs can be retried without recreating the workspace.
- Do not edit physical composed files or run another package install during a refresh. The lock serializes composition commands, not editors or arbitrary processes; preflight checks are not a filesystem sandbox.

Before initialization a named directory may contain its `next-hydra.json`, root and `apps/<app>/.gitignore` files, optional `README.md`, regular `apps/<app>/vercel.json` settings, restored caches and unrelated local files. Settings are not registry-owned: named composition omits customer ignore and Vercel defaults, preserves independently authored settings, and refuses deployment settings for unselected apps. App-local ignore rules remain preserved even when their app is no longer selected. Compose leaves unowned files alone and refuses to overwrite them at intended output paths. Preserve local work before manually deleting a workspace: Git ignore rules and composition snapshots are not backups of unregistered files.

New workspace files are visible as untracked files by default; there is no parent ignore policy hiding workspace folders. Add `workspaces/<name>/next-hydra.json`, then run `compose <name>`. Compose creates a workspace-local `.gitignore` only if it is missing. The default exposes the definition, root/app `.gitignore` files, README and app deployment settings while ignoring materialized application source, manifests and local state. Repository-wide secret, dependency and cache exclusions still apply. Commit the definition and the settings you want to maintain.

Each workspace owns that ignore policy. Edit it before or after initialization, or provide an empty file to decline the default. Compose preserves it, including local edits; `--check` reports a missing root file without creating it. App-local `.gitignore` files are preserved settings, not unregistered code, including files written by tools to ignore caches such as `.swc`. `--diff` excludes these settings and `--explain` identifies their workspace ownership. Existing root ignore rules are never rewritten automatically; add `!/apps/*/.gitignore` to their app allowlist if you want to commit app-local settings. New source files inside ignored application directories remain local unless you reconcile them into canonical source. Their presence does not fail `--check`; Git visibility is not an ownership or backup mechanism.

Use stable named workspaces for ongoing development. Disposable verification should allocate unique temporary directories and remove them in `finally` or test teardown, not accumulate numbered workspace copies. Composition staging and copied customer fixtures use the system temp directory. Lint snapshots stay below `workspaces/` to resolve maintainer tooling and use the same cleanup discipline.

The source checkout holds ordinary app implementations, authoring manifests, templates and provider-owned routes in their canonical registry locations. Project creation acquires the requested source revision in a temporary directory and uses the same workspace constructor as named `compose`. Source acquisition, credentials, Git initialization and refresh lifecycle differ; application selection and materialization do not. Scaffolded projects own ordinary copied files and do not retain this update contract.

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

Set Root Directory and enable access to files outside it in Vercel. Use Node 24 and the repository's pinned pnpm. Keep Vercel's automatic unaffected-project skipping disabled: before composition, the app's generated package graph is absent. The committed `ignoreCommand: "exit 1"` allows every deployment to reach installation and the application build. Root Directory stays at the app; it does not move to the repository root.

The app's committed configuration explicitly selects Next.js and provides:

1. **Install Command:** from the repository root, install only the `next-hydra...` and `create-next-hydra...` dependency closures, compose that workspace, and install its selected dependency graph.
2. **Build Command:** run `turbo run build --filter=<app>` from the composed workspace, using Turbo's default cache behavior.
3. **Output Directory:** `.next`, directly beneath this app. No parent-relative output redirection or canonical-app stand-in is needed.

Composition itself does not require Next.js. Vercel's builder resolves Next after its Install Command but before its Build Command, so composition and dependency installation belong in the Install Command. The actual composed app supplies Next at that point. See the [builder's installation order](https://github.com/vercel/vercel/blob/c628be7835e03a965b93e9cf9e2bd5ac2acbf5eb/packages/next/src/index.ts). The source root's build command builds the CLI; the hosted project builds only its selected app and required task dependencies.

Preview and production remain Git-triggered, with credentials and hosted URLs in Vercel. Each project has an isolated build checkout. Drupal-backed web follows the same path; Drupal's PHP backend is deployed separately. No command here changes hosted project settings or deploys through the Vercel CLI.

### Application-root caching

Each deployment composes its selected workspace, then runs ordinary Turbo tasks from that workspace's installed root. For example, the Contentstack API project uses:

```sh
# Install Command, starting in workspaces/storefront-contentstack/apps/api
cd ../../../.. && pnpm --filter 'next-hydra...' --filter 'create-next-hydra...' install --frozen-lockfile && pnpm --filter create-next-hydra compose storefront-contentstack

# Build Command, starting in that same app directory
cd ../.. && pnpm exec turbo run build --filter=api
```

Turbo hashes materialized files, the selected package graph and build-affecting environment variables. Explicit task inputs include application source even when Git ignores the named workspace. A cache hit restores declared build outputs; an input change reruns the relevant tasks. Composition preserves dependency caches, `.turbo/cache` and Next's incremental cache. Equivalent customer and named applications receive the same task policy and default Turbo cache behavior.

Composition and installation reconciliation still run before the application build. Turbo Remote Cache stores task outputs, not an installed `node_modules` tree. Vercel's build cache and pnpm's package store can reduce installation work, but do not guarantee it is free or skipped. Remote Cache must be available to the project, and reuse across different projects requires matching task inputs and environment. External CMS content is not a file input; when it must be refreshed at build time, force the relevant Turbo build or disable its cache explicitly.

The source checkout retains its pnpm package declarations because composition uses them to discover canonical packages, and package-level development still uses their dependency graphs. The filtered tooling install does not install every source app/provider. Use a full root `pnpm install` when working on source-level package tests that need those dependencies.

A new definition needs no task registration: compose it, then run its application commands. In Vercel, Install and Build commands each start in the configured app Root Directory. The `cd ../..` in Build moves to the composed workspace root, not the source repository root. The explicit app filter selects API in this example; it does not build sibling web or admin apps. Vercel also supports app-directory Turbo invocation through automatic scoping, but these committed commands keep application selection explicit.

These committed Vercel files are maintainer settings, not registry sources. Customer scaffolds retain the app-local `vercel.json` files and skip-CI scripts from the registry. They do not receive maintainer composition commands or deployment-specific cache locations. For example, the customer web and API defaults remain:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "ignoreCommand": "node scripts/skip-ci.js"
}
```

Admin uses the same configuration with `scripts/skip-ci.mjs`. Customers can continue configuring builds in the dashboard or customize their own files; composition adds no maintainer deployment instructions to them.

### Cache reuse and refresh safety

Workspace-owned settings remain editable physical files. Commit deployment commands and ignore rules alongside the workspace definition; composition preserves them. Source and destination paths are trusted; this is not a generic filesystem-redirection sandbox.

`compose <name>` uses ownership-aware updates: unchanged source is not rewritten, changed templates and files are refreshed, and unchanged files no longer selected are removed. It never clears the workspace or its cache directories. Next's `.next/cache`, package `node_modules` and Turbo artifacts stay in place. Dependency installation runs when selected dependency inputs change, dependencies are missing, or installation needs retry.

On a clean hosted checkout, committed settings may coexist with restored caches and unrelated local files but no ownership state. Initialization preserves them; existing files at intended output paths remain unowned and block publication. Installation still runs to reconcile restored dependencies when state is absent. Later refreshes retain `.workspace-composition.json` for conflict detection and interrupted-update recovery. Conflicting edits/deletions of managed files and unowned files occupying intended targets block refresh. Customer Git repositories cannot be converted into named workspaces.

Application task configuration is shared with customer creation, including environment inputs, dependency ordering, source hashing and output declarations. Turbo uses its default local cache at `.turbo/cache` and its configured Remote Cache. Deployment commands override neither cache placement nor cache backends; remote-cache environment is passed through unchanged. Preserving an existing local cache during composition does not guarantee Vercel restores it between deployments. Next's incremental compiler cache is separate from Turbo's complete build-output cache.

Environment variable names from the selected environment examples, plus public Next variables and the standard build environment, participate in Turbo's cache keys. Values are not written into composition state or generated configuration. This is conservative across the selected workspace; maintainers must keep examples or explicit Turbo `env` declarations current when adding build-affecting variables. Composition does not copy ignored local credentials into hosted builds.

Before changing production settings, verify a Git-triggered preview and a subsequent cached rebuild, including server routes, static assets and provider-specific handlers. Local composition/cache checks do not validate the hosted builder, external credentials or provider services. Stable named paths allow subsequent builds to reuse caches.

No hosted project settings are changed by composition. General references: [Vercel build configuration](https://vercel.com/docs/builds/configure-a-build), [Vercel monorepos](https://vercel.com/docs/monorepos).

## Browser tests

Every composed web workspace receives the same project-level E2E runner delivered to customers. Run `pnpm --dir workspaces/<name> test:e2e` inside its dependency graph. Pass Turbo options directly and Playwright arguments after `--`, for example `pnpm --dir workspaces/storefront-contentstack test:e2e --output-logs=full -- --grep 'Anonymous checkout' --workers=1`. This command does not materialize or refresh the workspace implicitly.

Refresh and check freshness first using the workflow above. `pnpm --dir workspaces/<name> test:e2e:list` lists available scenarios. CMS-only workspaces currently report zero supplied browser tests; commerce workspaces include the selected company, registration and checkout scenarios. Fixture imports and scenario discovery resolve entirely inside the composition.
