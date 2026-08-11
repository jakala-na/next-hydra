# shadcn CLI and registry exploration

Research snapshot: 2026-08-11. The upstream `shadcn/ui` `main` branch was inspected at commit [`41bbc12`](https://github.com/shadcn-ui/ui/tree/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612). Local comparisons describe the current Next Hydra checkout, not a proposed implementation.

## Executive answer

The shadcn registry is a strong reference for **declarative, composable source distribution**. A registry item can name nested registry items, npm and development dependencies, target files, environment placeholders, Tailwind configuration, CSS variables/rules, fonts, documentation, and metadata. The CLI resolves the complete graph before installation and offers dry-run, view, diff, skip, prompt, and overwrite behavior.

It is not a complete provider-composition system for Next Hydra. Its install context is fundamentally one JavaScript project, with special monorepo routing for shadcn's component aliases. It has no native CMS/Commerce compatibility predicates, installed-item ownership ledger, general removal, arbitrary file-patch language, or transaction spanning unrelated roots. Those omissions do **not** rule it out for the narrower developer-workspace goal where success means copying provider code and printing setup instructions rather than performing Composer or Drupal lifecycle operations.

One composite item can copy exact files into `apps/web`, `packages/cms-drupal`, and `apps/drupal-hydra` in one invocation when every file is an explicit universal target and the command runs from the monorepo root. That is sufficient for route files, TypeScript, PHP, YAML, and setup documentation. It is not sufficient for npm dependencies that belong to different workspace packages, because one resolved item tree has one dependency-install destination. Marking the files as `registry:file` also opts out of shadcn's framework transforms.

The bounded recommendation is therefore:

- **v1:** use ShadCN's documented `shadcn/registry` API as the actual fetch, graph-resolution, file-write, npm/env/CSS, and docs engine; keep a thin Next Hydra composition wrapper for provider selection, compatibility checks, and dispatching one install unit per working root;
- **do not yet:** fork ShadCN or implement a compatible resolver from scratch;
- **distribution:** start with trusted local registry items and move the same protocol to a private authenticated namespace when useful.

## What `shadcn add` actually does

The current command accepts item addresses plus `--overwrite`, `--path`, `--dry-run`, `--diff`, and `--view`; diff and view imply dry-run ([source](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/packages/shadcn/src/commands/add.ts#L37-L77)). Its lifecycle is:

1. Load local environment files, obtain or synthesize project configuration, and resolve any namespaced registries referenced by the requested items ([source](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/packages/shadcn/src/commands/add.ts#L75-L101)).
2. Fetch the first item. A universal item with explicit target files can bypass framework initialization and be added without `components.json`; non-universal items proceed through project preflight and may prompt to initialize shadcn configuration ([source](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/packages/shadcn/src/commands/add.ts#L108-L154), [source](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/packages/shadcn/src/commands/add.ts#L167-L220)).
3. For dry-run/diff/view, resolve the item tree and report prospective files, npm dependencies, CSS, environment variables, fonts, and docs without invoking the writer ([source](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/packages/shadcn/src/commands/add.ts#L279-L315), [source](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/packages/shadcn/src/utils/dry-run.ts#L36-L130)).
4. Otherwise resolve and validate the complete registry tree, update dependencies, Tailwind config, environment variables, fonts, files, then CSS, and finally print item docs ([source](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/packages/shadcn/src/utils/add-components.ts#L85-L152), [source](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/packages/shadcn/src/utils/add-components.ts#L394-L420)).

The package also exports `addRegistryItems` from `shadcn/registry`. Without a complete project config that API requires every resolved item to be universal, meaning item/file types must be `registry:item` or `registry:file` with explicit targets; it then runs non-interactively ([source](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/packages/shadcn/src/registry/add.ts#L12-L23), [source](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/packages/shadcn/src/registry/add.ts#L58-L101), [source](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/packages/shadcn/src/registry/utils.ts#L277-L309)). This is a useful embedding API, but it retains the same install semantics and omissions as the CLI.

## Registry item and dependency model

The item schema is declarative. Its common fields include:

- `dependencies` and `devDependencies` for npm packages;
- `registryDependencies` for other item addresses;
- `files`, with string content and optional or required targets depending on type;
- Tailwind config, CSS variables, CSS rules, environment variables, fonts, docs, categories, and free-form `meta` ([schema](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/packages/shadcn/src/registry/schema.ts#L100-L191)).

`registry:file` and `registry:page` require explicit targets. Other file types may use the conventional components, UI, lib, or hooks destinations inferred from `components.json` ([schema](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/packages/shadcn/src/registry/schema.ts#L100-L114)). A `registry:base` item may contain a partial shadcn project configuration, but this is the `components.json`/style contract, not a general mutation language for arbitrary JSON, YAML, Next, Composer, or Drupal configuration ([schema](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/packages/shadcn/src/registry/schema.ts#L178-L191)). Arbitrary config files can instead be copied as target files, with whole-file conflict behavior.

Registry dependencies may be bare shadcn names, namespaced items, GitHub item addresses, direct URLs, or local JSON item paths ([first-party schema docs](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/apps/v4/content/docs/registry/registry-item-json.mdx#L162-L191)). The resolver recursively fetches them, tracks visited addresses, carries the correct namespace configuration into nested fetches, and topologically sorts dependencies before dependents ([source](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/packages/shadcn/src/registry/resolver.ts#L148-L211), [source](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/packages/shadcn/src/registry/resolver.ts#L400-L539), [source](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/packages/shadcn/src/registry/resolver.ts#L697-L812)).

After ordering, the resolver deep-merges Tailwind, CSS variables, CSS, environment variables, and docs; combines npm dependencies; and deduplicates files by resolved target ([source](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/packages/shadcn/src/registry/resolver.ts#L323-L397)). A target collision is deterministic but permissive: the last file wins ([source](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/packages/shadcn/src/registry/utils.ts#L311-L347)). There is no schema field for `requires CMS=drupal`, `conflictsWith`, Commerce compatibility, or conditional files. `meta` could carry such data, but the shadcn resolver does not interpret it.

That distinction matters for Next Hydra: registry dependency edges answer “what else should this item install?” They do not answer “is this item valid for the selected CMS, Commerce provider, or other add-ons?”

## First-class side effects and their limits

| Concern | Current shadcn behavior | Next Hydra implication |
| --- | --- | --- |
| Target files | Copies textual content to explicit or alias-derived targets. `registry:file` preserves content without framework transforms ([source](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/packages/shadcn/src/utils/updaters/update-files.ts#L107-L198)). | Strong basis for routes, adapters, config files, TypeScript, YAML, and PHP text. It is not a binary artifact or provisioning protocol. |
| File conflicts | Identical files skip. Different existing files prompt, skip non-interactively, or overwrite with `--overwrite` ([source](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/packages/shadcn/src/utils/updaters/update-files.ts#L200-L298)). | Matches the map's additive/customer-owned source rule better than automatic deletion, provided overwrite remains explicit. |
| npm dependencies | Adds runtime/dev packages with the detected JS package manager. Bare packages already declared are skipped; explicit specs can intentionally change versions ([source](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/packages/shadcn/src/utils/updaters/update-dependencies.ts#L11-L87), [source](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/packages/shadcn/src/utils/updaters/update-dependencies.ts#L89-L169)). | Useful for npm contributions, but the dependency destination is one resolved JS package root. |
| Composer | No schema field or updater. All `dependencies`/`devDependencies` are sent to npm, pnpm, yarn, bun, Deno, or Expo-oriented flows ([source](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/packages/shadcn/src/utils/updaters/update-dependencies.ts#L187-L253)). | Requires a Next Hydra extension with a separate Composer requirement model, root, lockfile behavior, and command policy. |
| Environment | Adds missing keys to an existing env file or creates `.env.local`; it does not overwrite existing keys ([source](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/packages/shadcn/src/utils/updaters/update-env-vars.ts#L15-L107)). | Good developer-placeholder semantics, but provider manifests need target/root and secret-vs-example classification. Drupal and web env targets differ. |
| Tailwind/CSS | Merges the declarative tree and mutates the configured Tailwind/CSS files through specialized transforms ([source](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/packages/shadcn/src/utils/updaters/update-css.ts#L21-L108)). | Reusable only for frontend styling. It is not general config reconciliation. |
| Documentation | Concatenates and prints item docs after installation ([source](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/packages/shadcn/src/registry/resolver.ts#L353-L358), [source](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/packages/shadcn/src/utils/add-components.ts#L149-L151)). | Useful for manual follow-up, but docs are not proof that required provisioning occurred. |

### Arbitrary targets and multi-root workspaces

Explicit targets may use project-root `~/...`, project-relative paths, or the four shadcn aliases `@components`, `@ui`, `@lib`, and `@hooks` ([source](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/packages/shadcn/src/utils/updaters/update-files.ts#L386-L505), [first-party target docs](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/apps/v4/content/docs/registry/registry-item-json.mdx#L193-L312)). Path validation rejects traversal and absolute paths outside the command's `cwd` ([source](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/packages/shadcn/src/utils/is-safe-target.ts#L3-L97), [source](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/packages/shadcn/src/utils/add-components.ts#L452-L470)).

Shadcn does understand a particular JavaScript monorepo case: if TypeScript aliases resolve UI/lib/hooks/components into other workspace packages, it loads a `components.json` from each resolved package, groups files by those known aliases, and installs npm dependencies/CSS primarily into the UI package ([source](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/packages/shadcn/src/utils/get-config.ts#L229-L289), [source](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/packages/shadcn/src/utils/add-components.ts#L154-L224), [source](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/packages/shadcn/src/utils/add-components.ts#L226-L324)). This is not a general multi-root planner. It has no named `drupal`, `commerce`, `web`, or arbitrary application roots and no operation-specific working directory.

Consequently, a command run from `apps/web` cannot target `../drupal-hydra`; traversal is rejected. A universal exact-copy item run from the monorepo root can target both `apps/web/...` and `apps/drupal-hydra/...`, because both remain below the same `cwd`. That is the narrow mechanism behind the “yes for copying” answer.

## Dry-run, overwrite, update, removal, and ownership

The modern `add --dry-run` reports creates, overwrites, skips, npm/dev dependencies, CSS, env, fonts, and docs; `--diff [path]` computes a focused content diff and does not apply it ([source](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/packages/shadcn/src/utils/dry-run.ts#L36-L130), [source](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/packages/shadcn/src/commands/add.ts#L289-L315)). This is strong UX to reproduce.

Re-adding an item can act as an update:

- identical files are skipped;
- changed files require an interactive confirmation or `--overwrite`;
- npm requests are deduplicated and generally preserve existing bare-version declarations;
- environment keys are additive;
- CSS/Tailwind transforms merge into current files.

It is not an ownership-aware update. The strict `components.json` schema records style, aliases, and registry endpoints, but no installed item/version/file ledger ([schema](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/packages/shadcn/src/registry/schema.ts#L28-L75)). The command surface contains no general remove/uninstall command ([source](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/packages/shadcn/src/index.ts#L23-L52)). `apply` is specifically a design-preset operation that may reinstall and overwrite detected UI components; it is not a registry-item lifecycle manager ([source](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/packages/shadcn/src/commands/apply.ts#L73-L85), [source](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/packages/shadcn/src/commands/apply.ts#L151-L188)). `eject` only inlines shadcn's own Tailwind CSS dependency.

This omission is compatible with the [map's](../map.md) decision that copied source becomes customer-owned and must not be inferred safe to delete. For Next Hydra's disposable maintainer workspace, repeated switching should rebuild or reconcile only an explicitly designated derived root; it should not be implemented by pretending shadcn has reversible ownership metadata.

## Namespaced and private registries

Private distribution is first-class at the fetch layer:

- `components.json` can map an `@namespace` to a URL template or to an object with URL, query params, and request headers ([schema](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/packages/shadcn/src/registry/schema.ts#L6-L26));
- `${ENV_VAR}` placeholders are expanded in URLs, params, and headers, and missing referenced values cause validation errors ([source](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/packages/shadcn/src/registry/builder.ts#L58-L145), [source](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/packages/shadcn/src/registry/validator.ts#L14-L50));
- the fetcher applies headers per resolved URL, distinguishes authentication/authorization failures, and keys its cache by URL plus a hash of the headers ([source](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/packages/shadcn/src/registry/fetcher.ts#L26-L140));
- nested cross-registry dependencies retain their registry-specific auth context ([source](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/packages/shadcn/src/registry/resolver.ts#L182-L209), [source](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/packages/shadcn/src/registry/resolver.ts#L472-L503)).

The CLI can add a known public namespace from shadcn's registry directory or a caller-supplied `@namespace=URL` to `components.json` ([source](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/packages/shadcn/src/commands/registry/add.ts#L18-L50), [source](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/packages/shadcn/src/commands/registry/add.ts#L73-L186)). Advanced private headers/params require the object form in configuration. Direct GitHub registry addresses currently support public repositories only; private content should use an authenticated namespace ([first-party FAQ](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/apps/v4/content/docs/registry/faq.mdx#L92-L106)).

### Trust and security boundary

Authentication answers who may fetch an item; it does not establish that the fetched item is safe or immutable. The current safeguards are meaningful but bounded:

- fetched JSON is schema-validated;
- target traversal outside `cwd` is rejected;
- there is no item-provided arbitrary command hook;
- dependency strings beginning with flags are rejected before invoking a package manager ([source](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/packages/shadcn/src/utils/updaters/update-dependencies.ts#L200-L253)).

The remaining trust is substantial. A registry controls source text written into the repository, dependency names and explicit versions sent to the package manager, environment defaults, and CSS/config mutations. Package-manager installation may execute dependency lifecycle behavior even though the registry schema itself has no script hook ([npm lifecycle documentation](https://docs.npmjs.com/cli/v11/using-npm/scripts/#life-cycle-operation-order)). The registry item/config schemas contain no signature, content digest, provenance, permissions, or operation allowlist. Resolver hashes identify graph nodes; they are not artifact-integrity verification.

The first-party docs state the governing model plainly: users trust what they install and should configure only trusted registries ([source](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/apps/v4/content/docs/registry/namespace.mdx#L420-L436)). They recommend HTTPS and environment-backed credentials, but the schema itself does not enforce HTTPS ([source](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/apps/v4/content/docs/registry/authentication.mdx#L231-L266)). A future Next Hydra private registry therefore needs an explicit trust policy rather than treating auth as supply-chain verification.

## Fit against the current Next Hydra workspace

The current workspace is heterogeneous:

- pnpm discovers `apps/*` and `packages/*`, but that glob does not make every application a JavaScript package ([workspace config](../../../pnpm-workspace.yaml));
- `apps/web` is a Next package whose CMS selection is the aliased dependency `"@repo/cms": "workspace:@repo/cms-drupal@*"`, while Commerce combines the neutral `@repo/commerce` package with `@repo/commerce-commercetools` ([web manifest](../../../apps/web/package.json));
- the web application owns provider-specific route entry files such as [the Drupal preview route](../../../apps/web/app/api/drupal-preview/route.ts), so explicit application-file contributions are real;
- `packages/cms-drupal` is the JavaScript connector and exports three provider-specific route implementations, including Canvas and node preview behavior ([connector manifest](../../../packages/cms-drupal/package.json));
- the connector points to the separate Drupal application for its content-model configuration ([connector README](../../../packages/cms-drupal/README.md));
- `apps/drupal-hydra` is a Composer/DDEV Drupal 11 project with Drupal packages, Composer plugins, installer paths, patches, a recipe, and stateful installation steps ([Composer manifest](../../../apps/drupal-hydra/composer.json), [Drupal app README](../../../apps/drupal-hydra/README.md), [starter recipe](../../../apps/drupal-hydra/recipes/next-hydra-starter/recipe.yml)). The documented `ddev install` applies the recipe and creates credentials; those effects cannot be represented as file copies.

`create-next-hydra` currently selects only the destination and clone options, clones the starter, sanitizes it, optionally initializes Git, and tells the user to run pnpm ([CLI](../../../packages/create-next-hydra/src/index.ts), [scaffolder](../../../packages/create-next-hydra/src/scaffold.ts)). This makes it the natural future composition governor, but it currently has none of shadcn's registry resolution or provider orchestration.

### Composite Next plus Drupal item: precise answer

A single registry item could contain, for example, two exact text files:

- `registry:file` -> `apps/web/components/provider-widget.tsx`;
- `registry:file` -> `apps/drupal-hydra/web/modules/custom/provider_bridge/provider_bridge.info.yml` (and further PHP/YAML files).

If invoked at the repository root, both targets pass shadcn's within-`cwd` path rule, and the item is universal because every file has an explicit target. This proves that the registry data model is not limited to React extensions.

It still lacks every semantic operation that makes the second file set a Drupal installation:

- Composer requirement/repository/patch mutation and lockfile resolution;
- Drupal module/theme/recipe identity and compatibility;
- `drush en`, recipe application, database/config state, or DDEV lifecycle;
- choosing the correct Drupal root;
- coordination with the selected CMS and Commerce providers;
- rollback when a later ecosystem operation fails.

For a transformed `registry:component`, shadcn additionally expects a real Next/shadcn config and routes it through known JS aliases. Combining that mode with a sibling Drupal root is not a first-class workflow. Exact-copy `registry:file` avoids the framework assumption by also giving up its transformations.

## Follow-up decision: use ShadCN as the engine, not just inspiration

For the narrowed requirement—materialize copied code into developer workspaces and print the remaining setup—Next Hydra should **embed ShadCN rather than reimplement its registry resolver**. The seam is not “one composite item, one call.” It is “one small Next Hydra composition plan, several ShadCN install units.”

The package explicitly exports `./registry`, and the official API reference documents fetching, resolving, and installing items as stable programmatic APIs; it separately warns that CLI commands are not the public API ([package export](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/packages/shadcn/package.json#L29-L42), [API stability contract](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/apps/v4/content/docs/registry/api-reference.mdx#L6-L20)). `addRegistryItems` is the documented, non-interactive programmatic equivalent of `shadcn add`; it throws rather than exiting and skips existing files unless `overwrite` is enabled ([official API docs](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/apps/v4/content/docs/registry/api-reference.mdx#L167-L197)).

### Verified capability boundaries

| Question | Verified current behavior | Consequence for Next Hydra |
| --- | --- | --- |
| Can one item copy into all three roots? | Yes. Explicit targets are resolved below `config.resolvedPaths.cwd`, while target validation rejects paths outside that `cwd` ([target resolution](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/packages/shadcn/src/utils/updaters/update-files.ts#L386-L445), [containment validation](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/packages/shadcn/src/utils/add-components.ts#L452-L470)). From the repository root, `apps/web/**`, `packages/cms-drupal/**`, and `apps/drupal-hydra/**` are all safe. Universal `registry:file`/`registry:item` content is copied without framework transforms ([writer](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/packages/shadcn/src/utils/updaters/update-files.ts#L164-L198)). | A root-level, file-only composite works today for exact TypeScript, PHP, YAML, and other textual source. |
| Can it declaratively patch or merge arbitrary existing files? | No. A normal target is compared and then skipped, prompted, or wholly overwritten; the generic writer ultimately calls `writeFile` with the item content ([writer](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/packages/shadcn/src/utils/updaters/update-files.ts#L200-L298)). First-class merging is limited to ShadCN-owned domains: missing env keys, Tailwind/CSS, font/layout work, import/framework transforms, npm manifest changes through the package manager, and `components.json` design configuration. | Make provider-owned routes/modules new files where possible. Do not depend on a registry item to structurally patch arbitrary `package.json`, Next config, YAML, or existing application source. If one such mutation is unavoidable, the wrapper must own that narrowly typed mutation. |
| Where are npm dependencies installed? | The updater inspects and invokes the package manager in `config.resolvedPaths.cwd` ([source](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/packages/shadcn/src/utils/updaters/update-dependencies.ts#L11-L84), [source](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/packages/shadcn/src/utils/updaters/update-dependencies.ts#L218-L253)). ShadCN's special monorepo mode sends the entire merged dependency set to its detected UI workspace, not to a destination inferred independently for each file ([source](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/packages/shadcn/src/utils/add-components.ts#L170-L196)). | Do not attach all npm dependencies to the root composite. Define separate install units for `apps/web` and `packages/cms-drupal`, invoke `addRegistryItems` with each unit's `cwd`, and keep each unit's targets relative to that root. `apps/drupal-hydra` can be a file/docs-only unit. |
| Can it print post-install setup? | Yes. `docs` is part of the item schema, dependency docs are concatenated during resolution, and the installer prints them after project and workspace writes ([schema](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/packages/shadcn/src/registry/schema.ts#L157-L176), [resolver](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/packages/shadcn/src/registry/resolver.ts#L353-L358), [installer](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/packages/shadcn/src/utils/add-components.ts#L149-L151)). | Put DDEV, Composer, Drush, credential, recipe, and environment follow-up commands in item docs or aggregate them in the wrapper. They do not need to be executable provisioning operations. |
| Do `registry:base`, presets, or `apply` solve provider composition? | No. `registry:item` is the universal source-distribution type. `registry:base` is specifically a design-system base whose config is limited to ShadCN style, icons, TypeScript/RSC/RTL, Tailwind paths, aliases, and registries ([item types](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/apps/v4/content/docs/registry/registry-item-json.mdx#L96-L119), [base fields](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/apps/v4/content/docs/registry/examples.mdx#L482-L507)). A preset is an init/design configuration, not a registry item type; `apply` requires an existing ShadCN project and is designed to overwrite/reinstall UI components, fonts, CSS variables, and theme configuration ([source](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/packages/shadcn/src/commands/apply.ts#L73-L119), [source](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/packages/shadcn/src/commands/apply.ts#L151-L166)). | Model provider contributions as universal items. Do not overload bases or presets with CMS/Commerce meaning. |
| Can ShadCN validate CMS/Commerce compatibility? | Not by itself. The item schema permits arbitrary `meta`, and the official docs explicitly reserve it for custom tools and scripts ([schema](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/packages/shadcn/src/registry/schema.ts#L157-L190), [docs](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/apps/v4/content/docs/registry/examples.mdx#L629-L649)). There is no registry installer plugin, validation callback, or executable hook. The resolved install tree also contains files/dependencies/CSS/env/docs but drops item `meta` ([resolver](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/packages/shadcn/src/registry/resolver.ts#L338-L397)). | Keep the composition matrix in a small Next Hydra manifest, or fetch raw top-level items with `getRegistryItems` and validate `meta.nextHydra` before calling `addRegistryItems`. Do not expect the ShadCN resolver to enforce it. |
| Can it use a private registry? | Yes. Namespaces accept URL templates plus env-backed headers or query parameters ([official authentication guide](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/apps/v4/content/docs/registry/authentication.mdx#L16-L76)). Direct GitHub item addresses support only public repositories; private distribution must use an authenticated namespace ([official FAQ](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/apps/v4/content/docs/registry/faq.mdx#L92-L106)). | Local items are simplest for v1; private hosting later requires no protocol change. |
| Is embedding proven as an intended use? | Yes at the API-contract level. The official docs describe the package as supporting custom tooling, and `addRegistryItems`, `getRegistryItems`, and `resolveRegistryItems` are documented imports ([official API docs](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/apps/v4/content/docs/registry/api-reference.mdx#L6-L20), [official API docs](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/apps/v4/content/docs/registry/api-reference.mdx#L94-L197)). The inspected package version is `4.16.2` ([manifest](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/packages/shadcn/package.json#L1-L4)). | Import the documented subpath, pin the dependency, and add contract fixtures for Next Hydra's universal items. Avoid importing `@/src/...` internals or calling command modules. |

The protocol is also in substantial real use, although primarily for UI/source distribution rather than provider provisioning. ShadCN's reviewed registry directory includes Aceternity, LiveKit's Agents UI, Vercel AI Elements, and Magic UI as namespaced registries ([Aceternity](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/apps/v4/registry/directory.json#L51-L55), [Agents UI](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/apps/v4/registry/directory.json#L72-L76), [AI Elements](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/apps/v4/registry/directory.json#L86-L90), [Magic UI](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/apps/v4/registry/directory.json#L907-L911)). The official process validates and reviews directory submissions, but that is evidence of protocol adoption, not evidence that those projects exercise Next Hydra's multi-root pattern ([directory policy](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/apps/v4/content/docs/registry/registry-index.mdx#L6-L28)).

### Decision table

| Option | Decision | Why |
| --- | --- | --- |
| Use the ShadCN CLI as-is | **No as the backend; yes as a developer escape hatch.** | One CLI invocation has one dependency destination, it does not enforce compatibility, and the official docs exclude commands from the stable programmatic API. It remains useful for `add --dry-run`, `--diff`, and inspecting an individual item. |
| Wrap/embed `shadcn/registry` | **Yes—recommended v1.** | It directly reuses the supported resolver and installer. The wrapper only owns choices, compatibility, root dispatch, and aggregated reporting. |
| Fork or extend ShadCN internals | **No.** | The needed gaps can be handled outside the engine. A fork would couple Next Hydra to private transformers and command internals without improving the copied-code requirement. |
| Implement a ShadCN-compatible/inspired resolver | **No for v1.** | This duplicates fetching, auth, graph ordering, schemas, conflicts, writers, package-manager behavior, and docs. Reconsider only if Next Hydra later requires atomic cross-root plans, generic structural patches, ownership/removal, or operation types ShadCN cannot delegate. |

### Recommended wrapper shape

Keep one small, Next Hydra-owned composition manifest that selects provider install units and validates the matrix before any write. For example, Drupal can resolve to three entries: a web item with `cwd: apps/web`, a connector item with `cwd: packages/cms-drupal`, and a Drupal code/docs item with `cwd: apps/drupal-hydra`. Each item remains a standard universal ShadCN registry item with targets relative to its own root. The wrapper then calls the stable `addRegistryItems` API once per entry.

This is intentionally more than a blind pass-through and much less than a new registry engine:

1. `create-next-hydra` selects CMS, Commerce, and add-ons and validates their compatibility from its manifest before mutation.
2. It resolves the ordered list of `{ cwd, registryItems }` install units.
3. It invokes `addRegistryItems` for each root with the same trusted registry configuration and explicit overwrite policy.
4. ShadCN installs that root's npm dependencies, writes exact files, adds env/CSS contributions when applicable, and prints the item's setup docs.
5. The wrapper reports which later unit failed; cross-root atomic rollback is not supplied by ShadCN.

The programmatic API does not expose the CLI's exact `--dry-run`/`--diff` surface—its options are `cwd`, config, overwrite behavior, silence, fonts, and path ([source](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/packages/shadcn/src/registry/add.ts#L12-L23)). For v1, the wrapper can show the selected items, roots, resolved files/dependencies, and compatibility result through `getRegistryItems`/`resolveRegistryItems`, then install after confirmation. Exact transformed diffs can remain an advanced direct-CLI workflow until there is evidence they must be reproduced in the wrapper.

One package-alias caveat was verified in an isolated pnpm 10 workspace: the dependency request `@repo/cms@workspace:@repo/cms-drupal@*` does create the desired `@repo/cms` alias, but pnpm's default save policy normalized the stored range to `workspace:@repo/cms-drupal@^`. `--save-exact` preserved `*`, while ShadCN intentionally forwards dependency strings without that package-manager option ([source](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/packages/shadcn/src/utils/updaters/update-dependencies.ts#L218-L253)). Therefore the alias can remain a normal ShadCN dependency contribution if `^` is acceptable; if the exact `*` spelling is part of Next Hydra's contract, configure pnpm's save policy or let the thin wrapper own only that manifest edit.

## Conclusion

ShadCN already supplies the source-contribution engine Next Hydra needs: explicit targets, composable item graphs, schema validation, npm/env/CSS helpers, private namespaces, conflict behavior, setup docs, and CLI dry-run/diff tooling. Next Hydra does not need to reimplement that machinery merely because its provider selection spans multiple roots.

Embed the documented `shadcn/registry` API in v1. Keep only composition compatibility and per-root orchestration in `create-next-hydra`, split npm-bearing contributions by their package root, and use universal items for exact copied source. Forking or building a compatible resolver is future work only if requirements expand beyond those supported semantics.
