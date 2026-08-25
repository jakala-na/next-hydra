# Next.js provider contribution constraints

Research snapshot: 2026-08-10. The checkout uses Next.js 16.3.0, pnpm 10.11.0,
Node.js 24, TypeScript 5.9, and Turbopack for both `dev` and `build`.

## Conclusions bounded by the evidence

1. Installing a package cannot, by itself, register an App Router route. Next.js
   discovers `route.ts` or `route.js` files under the application's `app`
   directory. A provider may own the handler implementation, but the application
   still needs a physical route entry file, a physical dispatcher route, or a
   rewrite to such a dispatcher. [Next.js Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers)
2. A thin route entry can re-export a provider handler. This is the pattern used by
   all six current Drupal application entries. The package is therefore a viable
   owner of handler code, but not of route discovery.
3. pnpm aliases provide the intended stable import name in both workspaces and
   published projects. However, the selected alias is dependency state: changing
   it changes `package.json`, installation state, and the lockfile. Alias mutation
   alone cannot also provide a clean-worktree local switch.
4. `next.config` is executed as a Node module by Next's server/build phases before
   application bundling. A published provider's manifest and `next-config`
   entrypoints must consequently be directly executable by Node (normally compiled
   JavaScript), not raw TypeScript that relies on Next/Turbopack transpilation.
5. Ignored, deterministic generation under `app` is technically viable, but Next
   has no provider-artifact lifecycle or stale-output detector. The project must
   own generation, validation, collision checks, cleanup, and invocation before
   every relevant entry command.

These facts constrain the later architecture decision; they do not select an
option on preference.

## Route discovery and delegation

### Confirmed framework behavior

- Route Handlers are available only inside `app`, are discovered from the
  `route.ts|js` file convention, and a route entry cannot coexist with a `page`
  entry at the same segment. A single route file can export multiple supported
  HTTP methods; an unsupported method receives `405`. [Next.js Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers)
- Next 16.3's production discovery recursively reads the configured `app`
  directory, filters for App Router special files, and classifies `route` files
  as route handlers. It does not scan dependency packages for route entries.
  [Next.js 16.3 route discovery source](https://github.com/vercel/next.js/blob/v16.3.0/packages/next/src/build/route-discovery.ts#L97-L107)
- A package `exports` map maps importable package subpaths to files inside that
  package. Export targets cannot escape the package root, so `exports` cannot
  mount a provider file into a consuming application's `app` directory.
  [Node package entry points and target rules](https://nodejs.org/api/packages.html#package-entry-points)
- Route groups omit the parenthesized folder from the public URL, but two files
  in different groups that normalize to the same URL are a routing error.
  [Next.js Route Groups](https://nextjs.org/docs/app/api-reference/file-conventions/route-groups)
- A rewrite maps one URL to another URL. It cannot name a package function as its
  destination, so an internal rewrite still needs a discovered application route.
  Rewrite phase also determines collision behavior: `beforeFiles` can override
  filesystem routes, ordinary array/`afterFiles` rewrites run after static
  filesystem routes, and `fallback` runs after dynamic routes.
  [Next.js rewrites](https://nextjs.org/docs/app/api-reference/config/next-config-js/rewrites)
- Turbopack does not support webpack plugins. A webpack plugin that injects route
  entries is therefore not a cross-`dev`/`build` mechanism in this checkout.
  [Next.js Turbopack API](https://nextjs.org/docs/app/api-reference/turbopack)

### Mechanisms that remain viable

| Mechanism | What must remain in the application | Hard limits |
| --- | --- | --- |
| Thin static re-export | One `app/**/route.ts` per possible endpoint | The app must carry the superset of route files, and every selected package must satisfy every imported subpath or the build fails. This is unsuitable for genuinely asymmetric route exports unless the entries dispatch through an optional registry. |
| Generated re-export | Generated `app/(provider-generated)/**/route.ts` files | Generation must finish before Next starts discovery. The generator must own and replace one isolated directory, detect URL/method collisions, and remove routes from the previous selection. |
| Stable catch-all dispatcher | One route such as `app/api/_provider/[...path]/route.ts`, or one public catch-all | All handlers share one route entry's [Next runtime/segment configuration](https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config). The dispatcher must implement exact path/method matching, `404`, `405`, and collision semantics itself. A broad public catch-all also owns an API namespace and can interact with app routes. |
| Rewrites plus internal dispatcher | One internal route plus provider-contributed rewrite records in `next.config` | Rewrites add routing precedence and collision rules rather than avoiding them. They do not remove the need for an app route, and [they are unavailable to a pure static export](https://nextjs.org/docs/messages/export-no-custom-routes). |
| Scaffold-time copies | Physical route entries copied once into the generated project | Viable for `create-next-hydra`; switching later mutates tracked application files unless a separate local generation path exists. It does not meet clean local switching by itself. |

A generated route group can be gitignored without changing its public URLs. Git
ignore state is not a Next route convention, and the Next 16.3 production scanner
does not consult `.gitignore`; it reads the `app` tree. The safe inference is that
ignored generated entries are build-discoverable, provided they exist before
discovery. Generation before startup is still required rather than relying on a
running dev server to notice a complete provider switch.

## Configuration contributions

### `next.config` and provider packaging

Next documents `next.config` as a regular Node module used by development and build
phases, with function and async-function forms available for deterministic
composition. Package-owned functions such as `withCMS(config)` are therefore a
supported seam. [Next.js configuration](https://nextjs.org/docs/app/api-reference/config/next-config-js)

The checkout already uses that seam:

- [`apps/web/next.config.ts`](../../../apps/web/next.config.ts#L1) imports
  `withCMS` through the selected `@repo/cms` alias and applies it after the shared
  i18n, logging, toolbar, analyzer, and Sentry composition.
- The Drupal wrapper contributes Canvas integration, development origins, images,
  and environment values. The Contentstack wrapper contributes a different set of
  image origins and development origins.
  ([Drupal](../../../packages/cms-drupal/next-config.ts),
  [Contentstack](../../../packages/cms-contentstack/next-config.ts))
- The app also owns a Turbopack alias for the Commerce Layer binding at
  [`@repo/commerce/layers`](../../../apps/web/next.config.ts#L19).

`turbopack.resolveAlias` can remap imports for the Turbopack module graph, including
conditional aliases, but it is configuration consumed after `next.config` has
loaded. It cannot make an earlier static import inside `next.config.ts` resolve.
[Next.js Turbopack `resolveAlias`](https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopack#resolving-aliases)

There is a publication constraint not visible in the in-repo workspace arrangement.
Next's native TypeScript config resolver inherits Node's resolver limitations, and
Node explicitly refuses TypeScript type stripping for files below `node_modules`.
Because Next must execute the config before it can read `transpilePackages`, that
setting cannot be relied on to load the package module which provides the config.
Published provider manifests/configurators should therefore export built
`.js`/`.mjs` plus declarations (or data such as JSON that the loader reads
explicitly), even if local workspace source remains TypeScript.
([Next config TypeScript resolver](https://nextjs.org/docs/app/api-reference/config/typescript#using-nodejs-native-typescript-resolver-for-nextconfigts),
[Node TypeScript in dependencies](https://nodejs.org/api/typescript.html#type-stripping-in-dependencies))

The two CMS packages are not registry-ready today: both are `private`, version
`0.0.0`, and export raw source files.
([Drupal package](../../../packages/cms-drupal/package.json),
[Contentstack package](../../../packages/cms-contentstack/package.json))

### Environment, TypeScript, and tests

There is no Next-specific environment-schema extension point. Here the app composes
schemas as ordinary imports: [`apps/web/env.ts`](../../../apps/web/env.ts#L1)
imports `@repo/cms/keys` and extends the app schema with its result. Provider-owned
environment schemas remain viable as a stable package export; conflict validation
and `.env.example` provisioning remain CLI/application responsibilities.

TypeScript supports package-resolved base configs and, since TypeScript 5.0,
multiple `extends` entries with later entries winning conflicts.
[TypeScript 5.0 multiple `extends`](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-0.html#supporting-multiple-configuration-files-in-extends)
The current [`apps/web/tsconfig.json`](../../../apps/web/tsconfig.json#L1) already
extends `@repo/cms/typescript-config.json`. It also has CMS-specific `paths` entries
pointing at `node_modules/@repo/cms` so the broad `@repo/* -> ../../packages/*`
mapping does not intercept the package alias. TypeScript warns generally that
`paths` only informs TypeScript and does not change runtime resolution; workspaces
and actual `node_modules` package lookups are the matching runtime mechanism.
[TypeScript module resolution](https://www.typescriptlang.org/docs/handbook/modules/reference#paths)

Vitest has its own Vite-based configuration and does not consume Turbopack aliases.
It supports `mergeConfig` and top-level `resolve.alias` composition.
[Vitest configuration](https://vitest.dev/config/)
The checkout separately aliases `@repo/cms` to the app's installed dependency in
[`apps/web/vitest.config.ts`](../../../apps/web/vitest.config.ts#L5).

Derived constraint: the generator/lifecycle does not necessarily need to rewrite
all three files on every selection if each one refers to a stable bridge subpath.
It does need to provision them when scaffolding and validate them when synchronizing.
If manifests contribute arbitrary extra TypeScript, Vitest, or Turbopack aliases,
the composition engine needs typed merge rules; naive object spread gives silent
last-writer-wins behavior.

## pnpm alias resolution and the clean-switch boundary

pnpm supports registry aliases such as `alias@npm:actual-package@version`; imports
of the alias resolve to the actual package without source changes.
[pnpm aliases](https://pnpm.io/aliases)
Within a workspace, `"bar": "workspace:foo@*"` is the corresponding strict local
alias. pnpm refuses a registry fallback for `workspace:` and converts workspace
aliases to regular `npm:` aliases when the containing package is packed/published.
[pnpm workspace aliases](https://pnpm.io/workspaces#referencing-workspace-packages-through-aliases)

The current app records the selection as
`"@repo/cms": "workspace:@repo/cms-drupal@*"` in
[`apps/web/package.json`](../../../apps/web/package.json#L18), and the lockfile
records both that specifier and its linked target in
[`pnpm-lock.yaml`](../../../pnpm-lock.yaml#L458). The installed
`apps/web/node_modules/@repo/cms` symlink targets `packages/cms-drupal`, and Node
resolves `@repo/cms/next-config`, `@repo/cms/routes/canvas`, and
`@repo/cms/typescript-config.json` through the Drupal export map before Next
compilation.

Therefore:

- Scaffolded projects can install only the selected published package under the
  stable alias using `npm:` syntax.
- A source workspace can select a local package under the same stable alias using
  `workspace:` syntax.
- Changing either alias is an install operation and creates tracked manifest and
  lockfile changes. A clean-worktree local selector instead requires both candidate
  packages to be installed under stable real names, then an ignored generated
  bridge or app bootstrap config to select one. A manually changed `node_modules`
  symlink is neither lockfile-reproducible nor durable across installs.
- All stable imports that are unconditional must exist in every alias target.
  Asymmetric exports must be consumed through manifest-driven generation or an
  optional dispatcher, not through a static superset of alias subpaths.

## Current Drupal and Contentstack route shapes

The route asymmetry is concrete rather than hypothetical.

| Public endpoint | Method | Current provider export | Availability |
| --- | --- | --- | --- |
| `/api/drupal-preview` | `GET` | `@repo/cms/routes/draft` | Drupal and Contentstack both export `routes/draft`, though the endpoint name is Drupal-specific and their request contracts differ. |
| `/api/disable-drupal-preview` | `GET` | `@repo/cms/routes/disable-draft` | Both packages export it; the public path is Drupal-specific. |
| `/api/draft` | `GET` | `enableCanvasDraft` from `@repo/cms/routes/canvas` | Drupal only. |
| `/api/draft/renew` | `POST` | `renewCanvasDraft` from `@repo/cms/routes/canvas` | Drupal only. |
| `/api/disable-draft` | `POST` | `disableCanvasDraft` from `@repo/cms/routes/canvas` | Drupal only. |
| `/api/canvas/components` | `GET`, `OPTIONS` | component metadata handlers from `@repo/cms/routes/canvas` | Drupal only. |

Evidence:

- Application entries:
  [`drupal-preview`](../../../apps/web/app/api/drupal-preview/route.ts),
  [`disable-drupal-preview`](../../../apps/web/app/api/disable-drupal-preview/route.ts),
  [`draft`](../../../apps/web/app/api/draft/route.ts),
  [`draft/renew`](../../../apps/web/app/api/draft/renew/route.ts),
  [`disable-draft`](../../../apps/web/app/api/disable-draft/route.ts), and
  [`canvas/components`](../../../apps/web/app/api/canvas/components/route.ts).
- Drupal exports `./routes/canvas`, `./routes/draft`, and
  `./routes/disable-draft`; Contentstack exports only the latter two.
  ([Drupal exports](../../../packages/cms-drupal/package.json),
  [Contentstack exports](../../../packages/cms-contentstack/package.json))
- Drupal's Canvas handler module exposes three distinct draft endpoints and a
  two-method component endpoint.
  [`packages/cms-drupal/routes/canvas.ts`](../../../packages/cms-drupal/routes/canvas.ts)
- Contentstack's draft route expects `live_preview` and `originalPathname`, while
  Drupal validates Drupal-specific preview parameters. Sharing the export name
  does not mean sharing a route contract.
  ([Contentstack draft](../../../packages/cms-contentstack/routes/draft.ts),
  [Drupal draft](../../../packages/cms-drupal/routes/draft.ts))

The selected Drupal package satisfies all six application entries. Merely changing
the alias target to Contentstack leaves four files importing the unexported
`@repo/cms/routes/canvas` subpath, which must fail package export resolution. Static
superset entries are therefore not a provider-neutral local switching mechanism in
the current shape.

## Lifecycle, stale artifacts, and failure behavior

The checkout currently has no provider synchronization hook:

- root `dev` and `build` invoke Turbo directly, while root `prepare` only installs
  Husky and patches Effect tooling;
- web `dev`/`build` invoke Next directly, `test` invokes Vitest, and `typecheck`
  invokes `next typegen` followed by `tsgo`;
- `turbo.json` has no provider-sync dependency for `dev`, `build`, `test`, or
  `typecheck`.

([root scripts](../../../package.json#L5),
[web scripts](../../../apps/web/package.json#L4),
[Turbo tasks](../../../turbo.json#L6))

pnpm 10 runs `pre<name>`/`post<name>` scripts automatically for commands invoked
through `pnpm run`, so `predev`, `prebuild`, `pretest`, and `pretypecheck` are viable
command guards. They are bypassed by direct `next`, `vitest`, or `tsgo` execution,
and a root hook does not guard a separately invoked workspace script.
[pnpm 10 run lifecycle](https://pnpm.io/10.x/cli/run#enableprepostscripts)

A dependency package's install script is not a reliable provisioner. pnpm 10
requires dependency build-script approval and records approved packages in
`onlyBuiltDependencies`; this checkout already uses that allowlist. Provider sync
should be an explicit application/workspace command, not an implicit provider
`postinstall` side effect.
([pnpm 10 build approvals](https://pnpm.io/10.x/cli/approve-builds),
[`pnpm-workspace.yaml`](../../../pnpm-workspace.yaml))

Next provides no provider-manifest checksum. A deterministic generator or validator
must define its own failure contract. The minimum checks implied by the framework
constraints are:

1. resolve every selected package and manifest from the consuming app;
2. validate manifest schema and generator-version compatibility;
3. normalize all contributed public paths and methods before writing;
4. reject collisions against other providers and app-owned routes;
5. generate the full owned directory in a temporary sibling, then replace the old
   owned directory so removed provider routes cannot survive;
6. record a digest of generator version, selected package identities/versions, and
   normalized manifests;
7. before `dev`, `build`, `typecheck`, and `test`, either regenerate deterministically
   or compare the digest and fail with a command that repairs it; and
8. regenerate from an empty checkout in CI, because ignored artifacts are absent.

Validation in `next.config` can fail Next commands early because that module is
loaded by Next phases. It does not guard Vitest or a standalone TypeScript command,
so script/Turbo task wiring is still required for full coverage.

## Collision rules required above the frameworks

The composition layer must reject or explicitly combine these cases before handing
configuration to Next/Vitest/TypeScript:

- same normalized public path and same HTTP method: reject unless a manifest
  declares an application-owned composition rule;
- same path with disjoint methods: one physical route file may combine them, but
  only if runtime and route-segment requirements are compatible;
- generated path versus app-owned path, including a path hidden behind a route
  group: reject rather than overwrite or rely on Next's duplicate-route error;
- rewrite source overlap: require an explicit phase/precedence, because Next's
  result changes between `beforeFiles`, `afterFiles`, and `fallback`;
- duplicate `turbopack.resolveAlias` key with different targets: reject;
- nested `next.config` fragments, functions such as `rewrites`, and ordered wrapper
  functions: compose with field-specific rules and a fixed provider order, not
  shallow last-writer-wins spread;
- TypeScript base-config conflicts: surface them even though TypeScript's native
  behavior is later-entry-wins; and
- environment key duplicates: allow only equivalent declarations or a documented
  application override.

These rules are necessary when CMS and Commerce manifests contribute independently;
package category alone does not prevent them from choosing the same route or config
key.

## Constrained option set for the architecture ticket

### A. Installed packages plus ignored generated application adapters

The selected manifests generate exact route re-exports under an owned, ignored
route group and, where needed, generated config/selector bridges. This preserves
provider-specific route shapes and produces normal Next routes. Local clean switching
requires both candidate providers to already be installed under their real names;
scaffold output may instead install only the chosen provider under the public alias.
This option requires the full lifecycle and digest contract above.

### B. Installed packages plus stable application dispatcher

The app permanently owns one dispatcher route (optionally reached by manifest-
composed rewrites) and permanent bootstrap files for Next config, environment,
TypeScript, and tests. A local ignored selector chooses among already-installed
packages. This minimizes generated route files but centralizes path/method dispatch,
shares route-level Next settings, and requires an owned API namespace or rewrite
precedence. The provider manifest still describes routes; it does not provision
physical files.

### C. Alias mutation plus tracked provisioning

The CLI changes the `@repo/cms`/Commerce dependency aliases, installs, and copies or
removes exact app contributions. This is deterministic and appropriate for initial
`create-next-hydra` scaffolding or an explicit permanent migration. It inherently
changes tracked manifests, lockfiles, and likely application files, so it does not
satisfy clean developer-workspace switching.

### D. Scaffold-time materialization with a separate workspace-only selector

Published projects receive only their chosen aliased packages and physical files at
scaffold time (the simple production output), while this source workspace installs
all provider implementations and uses either option A or B for local comparison.
This deliberately gives scaffolded users and framework maintainers different
selection workflows while sharing the same package-owned manifest data.

No evidence found in Next.js, pnpm, Node, TypeScript, or Vitest supplies a native
provider-contribution manifest or eliminates the application composition root. The
remaining architecture decision is therefore between exact generated application
entries and a stable dispatcher, and whether scaffolded projects should retain any
switching machinery after creation.
