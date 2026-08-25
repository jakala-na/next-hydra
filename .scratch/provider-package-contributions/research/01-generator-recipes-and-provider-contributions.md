# Generator recipes and provider contributions

Research snapshot: 2026-08-10. `create-better-t-stack` was inspected at commit [`219ad05`](https://github.com/AmanVarshney01/create-better-t-stack/tree/219ad05c30f9bc7374b07735769518543f152a94), Turborepo at [`44c6fd6`](https://github.com/vercel/turborepo/tree/44c6fd6fae2967572d8dde917a657ba16026ad16), and shadcn/ui at [`d14b6e6`](https://github.com/shadcn-ui/ui/tree/d14b6e69a91f0fc99e31a7adb26a48d661df9911). Nx findings use its current first-party documentation.

## Answer at a glance

`create-better-t-stack` is not a package-owned recipe system. It is a centrally owned generator whose source of truth is split internally across typed option schemas, compatibility code, template-selection handlers, dependency/config processors, and imperative CLI setup helpers. That split handles a large scaffold-time combination matrix well, but an individual selectable technology does not ship a manifest or generator from its own installable package.

Its existing-project support is deliberately additive: `bts.jsonc` records the created stack, but the `add` command can only add previously absent addons. The current CLI has no general remove command and no command for replacing frontend, backend, auth, database, ORM, or other core selections. It therefore provides useful ideas for validating combinations and testing generated matrices, but it does not solve repeated CMS/Commerce switching.

The strongest ideas to prototype for Next Hydra come from three places:

- shadcn's registry item is the strongest declarative contribution shape: explicit target files, including pages/routes, package dependencies, nested item dependencies, environment hints, and installation docs;
- Nx sync generators provide the strongest desired-state semantics: idempotent reconciliation, write only when changed, dry-run/check behavior, and CI drift detection; and
- the already-installed Turborepo/Plop mechanism is a credible lightweight execution host for a maintainer-workspace prototype, including package-local generators, but it is not itself a manifest, ownership ledger, or switching protocol.

No investigated tool provides the complete required lifecycle out of the box. In particular, none combines package-owned asymmetric contributions with automatic removal of the previous provider, conflict-safe preservation of app-owned files, dependency deprovisioning, and a guaranteed clean tracked worktree after repeated switches.

## Follow-up: who owns add-on compatibility?

Current upstream `main` was rechecked at the same `219ad05` commit after the composition interview raised this exact question. Better T Stack has add-on-aware compatibility behavior, but add-ons do **not** own declarative manifests containing their requirements and conflicts.

- Add-on IDs, input options, and one task-runner conflict are centrally enumerated in `@better-t-stack/types` ([IDs](https://github.com/AmanVarshney01/create-better-t-stack/blob/219ad05c30f9bc7374b07735769518543f152a94/packages/types/src/schemas.ts#L34-L66), [options](https://github.com/AmanVarshney01/create-better-t-stack/blob/219ad05c30f9bc7374b07735769518543f152a94/packages/types/src/schemas.ts#L376-L427)).
- The CLI owns an add-on-keyed frontend compatibility map plus imperative special cases and mutual exclusions ([map](https://github.com/AmanVarshney01/create-better-t-stack/blob/219ad05c30f9bc7374b07735769518543f152a94/apps/cli/src/constants.ts#L53-L73), [evaluator](https://github.com/AmanVarshney01/create-better-t-stack/blob/219ad05c30f9bc7374b07735769518543f152a94/apps/cli/src/utils/compatibility-rules.ts#L391-L525)).
- Templates, dependency mutations, and side-effectful setup are also dispatched centrally by add-on ID rather than discovered from installed add-on packages ([templates](https://github.com/AmanVarshney01/create-better-t-stack/blob/219ad05c30f9bc7374b07735769518543f152a94/packages/template-generator/src/template-handlers/addons.ts#L6-L31), [dependencies](https://github.com/AmanVarshney01/create-better-t-stack/blob/219ad05c30f9bc7374b07735769518543f152a94/packages/template-generator/src/processors/addons-deps.ts#L15-L91), [setup](https://github.com/AmanVarshney01/create-better-t-stack/blob/219ad05c30f9bc7374b07735769518543f152a94/apps/cli/src/helpers/addons/addons-setup.ts#L53-L129)).

The precise precedent is therefore **centrally owned generator rules organized by add-on key**, not **package-owned add-on manifests**. Next Hydra can copy the behavior while choosing a more cohesive per-feature recipe representation.

## `create-better-t-stack`

### Ownership and representation

The selectable vocabulary is centrally enumerated in `@better-t-stack/types`: frontend, backend, auth, addons, deployment choices, and their mutual-exclusion checks are closed Zod enums and array refinements ([source](https://github.com/AmanVarshney01/create-better-t-stack/blob/219ad05c30f9bc7374b07735769518543f152a94/packages/types/src/schemas.ts#L3-L110)). The generator receives one `ProjectConfig`, creates one virtual filesystem, runs a fixed sequence of handlers and processors, then writes `bts.jsonc` into the result ([source](https://github.com/AmanVarshney01/create-better-t-stack/blob/219ad05c30f9bc7374b07735769518543f152a94/packages/template-generator/src/generator.ts#L50-L102)).

Files are generator-owned Handlebars templates under the central `packages/template-generator/templates` tree. Conditional code selects template prefixes from the complete stack configuration. For example, the auth handler branches across auth provider, backend, ORM/database, web framework, and native framework before copying centrally stored template prefixes into application/package targets ([source](https://github.com/AmanVarshney01/create-better-t-stack/blob/219ad05c30f9bc7374b07735769518543f152a94/packages/template-generator/src/template-handlers/auth.ts#L6-L190)). Addons use the same model; PWA has framework-specific template prefixes while task runners are special-cased into programmatic generators ([source](https://github.com/AmanVarshney01/create-better-t-stack/blob/219ad05c30f9bc7374b07735769518543f152a94/packages/template-generator/src/template-handlers/addons.ts#L6-L31)). Dependencies, environment files, package configuration, plugins, catalog entries, and README content are separate central processors in the same generation pipeline ([source](https://github.com/AmanVarshney01/create-better-t-stack/blob/219ad05c30f9bc7374b07735769518543f152a94/packages/template-generator/src/generator.ts#L66-L95)).

Some technologies also require imperative setup outside the pure template generator. Project creation first writes the generated tree and then runs database setup, addon setup, formatting, dependency installation, and Git initialization from the CLI package ([source](https://github.com/AmanVarshney01/create-better-t-stack/blob/219ad05c30f9bc7374b07735769518543f152a94/apps/cli/src/helpers/core/create-project.ts#L52-L133)). Thus the precise ownership classification is **generator-owned, split across generator subsystems**:

- option identity and input schema: `@better-t-stack/types`;
- files and deterministic project transforms: `@better-t-stack/template-generator`;
- compatibility and prompts: CLI code;
- external provisioning and other side effects: CLI setup helpers.

It is not split between independently installable technology packages. Adding or changing a technology requires changing this generator distribution.

### Combinations and conflicts

Combinations are resolved centrally, in two ways:

1. validation code rejects invalid cross-option combinations and supplies user-facing reasons; task runners are explicitly mutually exclusive, and addon compatibility is evaluated against frontend, auth, backend, and runtime ([source](https://github.com/AmanVarshney01/create-better-t-stack/blob/219ad05c30f9bc7374b07735769518543f152a94/apps/cli/src/utils/compatibility-rules.ts#L391-L524));
2. template handlers encode the supported branches and overlays for valid combinations, as the auth example demonstrates.

Within a generated tree, writing a second contribution to the same virtual path replaces the first content because `VirtualFileSystem.writeFile` writes directly to the normalized path ([source](https://github.com/AmanVarshney01/create-better-t-stack/blob/219ad05c30f9bc7374b07735769518543f152a94/packages/template-generator/src/core/virtual-fs.ts#L15-L30)). The handler order is therefore part of combination semantics. This is controlled central overlay behavior, not independent package conflict negotiation.

The `merge`, `overwrite`, `increment`, and error strategies advertised by the CLI are whole-project-directory creation strategies. Interactive `merge` keeps unrelated files and allows generated conflicts to replace paths, while `overwrite` clears the directory ([source](https://github.com/AmanVarshney01/create-better-t-stack/blob/219ad05c30f9bc7374b07735769518543f152a94/apps/cli/src/utils/project-directory.ts#L21-L135)). They do not track which technology owns an existing file and do not provide a provider switch transaction.

### Existing projects and repeated switching

`bts.jsonc` records the original stack and a reproducible command, and its generated comments specifically advertise retaining the file for the `add` command ([source](https://github.com/AmanVarshney01/create-better-t-stack/blob/219ad05c30f9bc7374b07735769518543f152a94/packages/template-generator/src/bts-config.ts#L11-L63)). The current command router exposes project creation plus `add`/`addJson`, where `add` is described only as adding addons to an existing project ([source](https://github.com/AmanVarshney01/create-better-t-stack/blob/219ad05c30f9bc7374b07735769518543f152a94/apps/cli/src/index.ts#L131-L288)).

The add handler filters out addons already recorded in `bts.jsonc`, appends new addons to the existing list, validates the resulting combination, processes only the new addon templates/dependencies, and updates the config after writing ([source](https://github.com/AmanVarshney01/create-better-t-stack/blob/219ad05c30f9bc7374b07735769518543f152a94/apps/cli/src/helpers/core/add-handler.ts#L231-L327), [source](https://github.com/AmanVarshney01/create-better-t-stack/blob/219ad05c30f9bc7374b07735769518543f152a94/apps/cli/src/helpers/core/add-handler.ts#L329-L449)). The config updater itself permits only addons, addon/database setup options, and deployment fields; it cannot rewrite core technology selections ([source](https://github.com/AmanVarshney01/create-better-t-stack/blob/219ad05c30f9bc7374b07735769518543f152a94/apps/cli/src/utils/bts-config.ts#L28-L58)).

Therefore:

- one-time project generation: supported;
- adding supported addons later: supported, with an additive config record;
- removing an addon and all of its files/dependencies: not supported by the current general command surface;
- replacing a core technology and deprovisioning the prior one: not supported;
- repeatedly switching A -> B -> A without source churn: not a design goal of the current implementation.

## Strong primary-source alternatives

### shadcn registry items: best declarative recipe shape, incomplete lifecycle

The shadcn registry schema is the closest match to a provider contribution manifest. A registry item can declare npm dependencies, dev dependencies, dependencies on other registry items, explicit files, CSS/config additions, environment variables, installation documentation, and arbitrary metadata. `registry:page` and `registry:file` require explicit targets, so route files and miscellaneous application configuration are first-class rather than forced into a uniform component shape ([schema source](https://github.com/shadcn-ui/ui/blob/d14b6e69a91f0fc99e31a7adb26a48d661df9911/packages/shadcn/src/registry/schema.ts#L81-L114), [schema source](https://github.com/shadcn-ui/ui/blob/d14b6e69a91f0fc99e31a7adb26a48d661df9911/packages/shadcn/src/registry/schema.ts#L143-L191)). The first-party schema documentation explicitly shows a route target such as `app/hello/page.tsx` and root/config targets ([docs](https://ui.shadcn.com/docs/registry/registry-item-json#files)).

Composition is also explicit. The resolver topologically sorts registry dependencies, deep-merges structured contributions, deduplicates files by resolved target path, and combines package dependencies into one resolved install tree ([source](https://github.com/shadcn-ui/ui/blob/d14b6e69a91f0fc99e31a7adb26a48d661df9911/packages/shadcn/src/registry/resolver.ts#L315-L397)). Namespaced registry resolution defines collision order as “last one wins,” making conflict behavior deterministic, though not necessarily safe for application-owned files ([docs](https://ui.shadcn.com/docs/registry/namespace#how-it-works)). The CLI provides overwrite, dry-run, diff, and view operations before applying the resolved tree ([source](https://github.com/shadcn-ui/ui/blob/d14b6e69a91f0fc99e31a7adb26a48d661df9911/packages/shadcn/src/commands/add.ts#L37-L66), [source](https://github.com/shadcn-ui/ui/blob/d14b6e69a91f0fc99e31a7adb26a48d661df9911/packages/shadcn/src/commands/add.ts#L282-L315)).

The missing half is lifecycle ownership. The strict project config schema records style, Tailwind settings, aliases, and registry endpoints, but no installed-item/file ownership ledger ([source](https://github.com/shadcn-ui/ui/blob/d14b6e69a91f0fc99e31a7adb26a48d661df9911/packages/shadcn/src/registry/schema.ts#L28-L75)). The current CLI command list has no general registry-item removal command ([source](https://github.com/shadcn-ui/ui/blob/d14b6e69a91f0fc99e31a7adb26a48d661df9911/packages/shadcn/src/index.ts#L1-L54)). Installation updates dependencies, environment variables, files, config, and CSS in place ([source](https://github.com/shadcn-ui/ui/blob/d14b6e69a91f0fc99e31a7adb26a48d661df9911/packages/shadcn/src/utils/add-components.ts#L85-L134)); it does not provide a reversible provider-switch transaction.

Applicability: prototype the **manifest vocabulary, target resolution, dependency graph, schema validation, deterministic collision reporting, and dry-run/diff UX**. Reject direct use of the shadcn CLI as Next Hydra's provider switcher.

### Nx plugin and sync generators: best desired-state semantics, executable rather than declarative

Nx plugins can own generators. The plugin's `generators.json` registers an implementation, its JSON schema defines validated options, and its package contains file templates; a generator mutates a virtual `Tree` and can be run with `--dry-run` ([official plugin guide](https://nx.dev/docs/kb/intro#understand-the-generator-functionality), [local generator guide](https://nx.dev/docs/extending-nx/local-generators)). The file API can create, update, move, and delete workspace files and offers overwrite, keep-existing, and throw-if-existing strategies ([official file-generation guide](https://nx.dev/docs/extending-nx/creating-files)). This is a real package-owned executable recipe model.

Nx sync generators add the semantics most relevant to frequent switching. They are expected to be idempotent, to write only when content actually changes, and to report when the repository is out of sync. They can run explicitly via `nx sync`, before configured tasks, or in CI via `nx sync:check` ([official sync-generator guide](https://nx.dev/docs/extending-nx/create-sync-generator#performance-and-dx-considerations), [sync-generator concepts](https://nx.dev/docs/concepts/sync-generators#run-nx-synccheck-in-ci)).

Those guarantees are conventions and framework support, not an installed contribution model. A generator is arbitrary code; file ownership, provider conflict policy, dependency removal, and round-trip switching must still be designed by its author. Nx also is not the repository's task runner. Applicability: prototype **idempotent desired-state reconciliation and check-only drift detection**, but reject introducing Nx solely to obtain those semantics.

### Turborepo/Plop: credible local execution host, not the contract

Turborepo custom generators are Plop configurations. Turbo automatically discovers root and workspace-local generator configs, organizes them by workspace, and executes a workspace generator from that workspace's root ([official guide](https://github.com/vercel/turborepo/blob/44c6fd6fae2967572d8dde917a657ba16026ad16/apps/docs/content/docs/guides/generating-code.mdx#L51-L79), [official guide](https://github.com/vercel/turborepo/blob/44c6fd6fae2967572d8dde917a657ba16026ad16/apps/docs/content/docs/guides/generating-code.mdx#L249-L258)). The source confirms discovery iterates the repository's known workspaces, while an explicit `--config` path can select another config ([source](https://github.com/vercel/turborepo/blob/44c6fd6fae2967572d8dde917a657ba16026ad16/packages/turbo-gen/src/utils/plop.ts#L53-L130)). This means a CMS or Commerce workspace package can technically own a local generator during Next Hydra development, but an ordinary dependency hidden in `node_modules` is not automatically a workspace-discovered provider recipe.

Plop actions can add one or many files, modify or append content, skip existing paths, force writes, or execute arbitrary custom functions ([source](https://github.com/vercel/turborepo/blob/44c6fd6fae2967572d8dde917a657ba16026ad16/packages/turbo-gen/src/types.ts#L31-L125)). Turbo invokes those actions and reports their changes or failures ([source](https://github.com/vercel/turborepo/blob/44c6fd6fae2967572d8dde917a657ba16026ad16/packages/turbo-gen/src/utils/plop.ts#L345-L418)). Its current `generate run` command exposes arguments, config path, and repository root, but no dry-run/check mode ([reference](https://github.com/vercel/turborepo/blob/44c6fd6fae2967572d8dde917a657ba16026ad16/apps/docs/content/docs/reference/generate.mdx#L28-L52)). Ownership, deprovisioning, transactional rollback, and combination validation are left to generator code.

Next Hydra already has the necessary dependency and a root generator, but that generator only creates `package.json` and `tsconfig.json` for a new package ([current generator](../../../turbo/generators/config.ts)). Extending it is credible for a low-cost maintainer-workspace prototype because it avoids introducing another framework. It should remain an execution shell around separately validated provider contributions, not become the source of truth or the final scaffold-time package discovery contract.

## Comparison

| System | Recipe ownership | Conditional files/routes | Dependencies and environment | Combination/conflict behavior | Repeated switching |
| --- | --- | --- | --- | --- | --- |
| create-better-t-stack | Central generator, split internally | Strong central matrix and template overlays | Strong central processors plus imperative setup | Central validators; fixed handler order; project-directory merge/overwrite | Core switching unsupported; later flow is additive addons only |
| shadcn registry | Registry-item owner; declarative schema | Explicit target files, including pages/routes | Dependencies, dev dependencies, env hints, docs, nested items | Topological resolution, deep merge, deterministic target dedupe; dry-run/diff | Reinstall/overwrite supported; no general ownership ledger or removal lifecycle |
| Nx plugin | Package-owned executable generator | Arbitrary Tree transforms and templates | Arbitrary executable transforms/install tasks | Explicit overwrite strategies; generator author owns cross-plugin policy | Implementable as an idempotent sync generator, not automatic |
| Turbo/Plop | Repository/workspace-owned executable generator | Arbitrary Plop/custom actions | Arbitrary custom actions | Add/modify/append controls; failures reported; no system-level resolver | Implementable manually; no built-in dry-run, ownership, or deprovisioning |

## Ideas that deserve a prototype

1. **A package-local declarative contribution descriptor.** Start with the shadcn ideas that directly match this problem: named item/capability, explicit target files, dependencies/dev dependencies, environment requirements, docs, nested contributions, and deterministic target-collision diagnostics. Test asymmetric CMS route sets rather than inventing a common route list.
2. **A resolver separated from the writer.** Resolve CMS plus Commerce contributions into one desired plan, validate the combination, and show a dry-run/diff before touching the workspace. Borrow shadcn's resolve-first shape and create-better-t-stack's central composition validation without centralizing provider templates.
3. **A round-trip desired-state reconciler.** On a disposable fixture, prove A -> B -> A is idempotent, removes only files and dependency entries owned by the old provider, preserves app-owned edits, detects drift, and can assert “in sync” without writing. These are the Nx sync-generator semantics that matter; they do not require adopting Nx.
4. **The existing Turbo generator as a maintainer-only harness.** Use `@turbo/gen` to invoke the prototype against workspace-local provider contributions and gather real Drupal/Contentstack route and configuration cases. Keep the contribution schema and resolver runnable independently so `create-next-hydra` can consume the same data later.
5. **A small imperative escape-hatch experiment.** Compare a purely declarative descriptor with a descriptor plus a tightly scoped package-owned transform hook for changes that cannot safely be expressed as target-file copies. The experiment should reveal whether Next config/env/package mutations need code; it should not default the whole model to arbitrary scripts.
6. **Combination-matrix tests.** Borrow create-better-t-stack's strongest practice: validate supported combinations and build representative generated outputs. For Next Hydra, the matrix should focus on CMS x Commerce contribution conflicts and provider-specific route asymmetry rather than every stack technology.

## Ideas to reject

- **Copying create-better-t-stack's architecture wholesale.** Its central generator matrix is effective for initial creation, but it makes the generator the owner of every provider detail and does not implement removal or switching.
- **Treating raw Plop actions as the provider manifest.** They are executable and convenient, but they provide no inspectable contribution plan, ownership model, drift contract, or shared scaffold-time data model.
- **Using the shadcn CLI directly as the provider manager.** Its manifest and resolver are instructive, but its in-place copy/merge semantics and lack of general uninstall ownership do not meet clean repeated switching.
- **Adopting Nx solely for this feature.** Its sync semantics are excellent, but reproducing the small relevant protocol above the existing Turbo workspace is a narrower experiment than replacing or duplicating the monorepo framework.
- **Using whole-directory merge/overwrite as switching.** That is safe enough for one-time scaffolding into a chosen directory, but it cannot distinguish provider-owned contributions from application-owned code and therefore cannot guarantee a clean reversible maintainer workflow.

## Research conclusion

`create-better-t-stack` answers “how can one generator materialize a large validated selection matrix?” It does not answer “how can independently owned provider packages be repeatedly selected and deselected in an existing workspace?”

The evidence supports prototyping a hybrid: shadcn-like declarative package contributions, create-better-t-stack-like composition validation and matrix tests, Nx-like idempotent sync/check semantics, and the existing Turbo generator as a temporary local runner. The final Next Hydra contract should not be chosen until that prototype demonstrates reversible Drupal/Contentstack and Commerce contribution lifecycles against real App Router files and package aliases.
