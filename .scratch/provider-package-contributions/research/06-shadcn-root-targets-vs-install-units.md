# ShadCN root targets versus Next Hydra Install Units

Date: 2026-08-12

## Conclusion

An earlier Next Hydra prototype made ShadCN do extra work because its generated registry targets were relative to each package and it compensated by changing ShadCN's working directory for every Install Unit. For file placement, that was the wrong model and was removed before commit.

The simpler ShadCN-native model is:

- Keep each source `registry.json` next to the code it describes.
- Keep `files[].path` relative to that source registry.
- Make `files[].target` complete from the consumer workspace root, for example `~/packages/cms-drupal/auth.ts` or `~/apps/drupal-hydra/composer.json`.
- Ask ShadCN to add the selected top-level item once from the consumer workspace root and let ShadCN follow `registryDependencies`.

In ShadCN terminology these are **project-root-relative targets**, not operating-system absolute paths. A literal path such as `/Users/alice/project/apps/web/...` is neither portable nor the registry convention. `~/apps/web/...` means “under the invocation project's root.” [ShadCN's registry item specification](https://ui.shadcn.com/docs/registry/registry-item-json#target) documents this explicitly.

This change removes the need for Next Hydra to split the registry graph into per-root ShadCN calls. It does **not** remove all Next Hydra behavior: compatibility checks, maintainer-only removal of files belonging to inactive selections, package-specific `package.json` edits, binary assets, and customer-workspace review rules remain Next Hydra concerns. Provider-specific routes are ordinary registry files and do not need a separate generator.

## What caused the apparent flattening problem

The current registry sync script emits targets such as `~/auth.ts` inside `packages/cms-drupal/registry.json`. That target only means `packages/cms-drupal/auth.ts` when ShadCN is invoked with `packages/cms-drupal` as its project root. If the same item is resolved as a dependency of an add-on and installed from the repository root, the target correctly resolves to the repository's `auth.ts` instead.

ShadCN is not stripping a package prefix. The prefix was never present in the published target.

ShadCN intentionally resolves the selected items and all of their `registryDependencies` into one installable tree. Its public API describes `resolveRegistryItems` as recursively walking registry dependencies and merging their files, package dependencies, CSS variables, and other fields into a single object. [`addRegistryItems` uses that install model](https://ui.shadcn.com/docs/registry/api-reference#resolveRegistryItems). The current source implementation traverses dependencies, topologically orders the items, and deduplicates files by their resolved target path; it does not carry a separate current working directory for each dependency. [Resolver source](https://github.com/shadcn-ui/ui/blob/main/packages/shadcn/src/registry/resolver.ts), [target deduplication source](https://github.com/shadcn-ui/ui/blob/main/packages/shadcn/src/registry/utils.ts).

The installed ShadCN 4.16.2 source in this workspace has the same behavior:

- `resolveRegistryItems` recursively produces one merged tree.
- A `~/...` target resolves with `path.join(config.resolvedPaths.cwd, targetWithoutTilde)`.
- `addRegistryItems` installs that tree against one resolved `cwd`/config.

A no-write local probe against that installed version resolved a DAM item whose
`registryDependencies` contained a Drupal item. The merged tree retained all
three complete targets unchanged:

```text
~/packages/cms-drupal/auth.ts
~/apps/drupal-hydra/composer.json
~/packages/cms-drupal/integrations/dam.ts
```

Therefore an item whose dependency files target `~/packages/cms-drupal/...` and `~/apps/drupal-hydra/...` can be installed once from the workspace root without losing either location.

## Source authoring stays colocated

Changing the consumer target does not require moving registry definitions or source files to the repository root. ShadCN distinguishes the two paths:

```json
{
  "path": "auth.ts",
  "type": "registry:file",
  "target": "~/packages/cms-drupal/auth.ts"
}
```

- `path` tells the registry builder where the source file lives. With nested registry files, it is relative to the `registry.json` that declares the item.
- `target` tells the consumer CLI where the copied file belongs.

ShadCN explicitly supports keeping included registry definitions close to their source files and resolving source paths relative to the declaring registry file. [Registry include documentation](https://ui.shadcn.com/docs/registry/registry-json#include), [GitHub registry example](https://ui.shadcn.com/docs/registry/github#organize-with-include).

Next Hydra's sync script can therefore derive the target from the existing `sourceRoot`:

```text
sourceRoot: packages/cms-drupal
relative source path: auth.ts
consumer target: ~/packages/cms-drupal/auth.ts
```

This preserves maintainer ergonomics while giving every copied file one stable identity in a consumer workspace.

## One root add works for these registry items

Next Hydra's package/app items are already modeled as universal `registry:item` entries containing explicitly targeted `registry:file` files. ShadCN defines such items as installable without framework detection or a `components.json`. The normal CLI fast-path and the public `addRegistryItems` API both support this. [`addRegistryItems` API contract](https://ui.shadcn.com/docs/registry/api-reference#addRegistryItems), [universal-item check](https://github.com/shadcn-ui/ui/blob/main/packages/shadcn/src/registry/utils.ts), [`add` command fast-path](https://github.com/shadcn-ui/ui/blob/main/packages/shadcn/src/commands/add.ts).

As a result, either of these is viable for the file-copy portion:

```text
shadcn add <next-hydra-item> --cwd <workspace-root>
```

or the current programmatic equivalent:

```ts
await addRegistryItems([item], {
  cwd: workspaceRoot,
  config: registriesConfig,
  overwrite: false,
  silent: true,
})
```

ShadCN follows `registryDependencies` itself. Next Hydra does not need to fetch each dependency, remove `registryDependencies`, write temporary artifacts, or invoke ShadCN once per package root merely to preserve file paths.

## What ShadCN monorepo support does and does not do

ShadCN's built-in monorepo support is aimed at its known component categories. The documented setup gives each app/package a `components.json` and uses aliases so an invocation from `apps/web` can route `registry:ui`, `registry:lib`, `registry:hook`, and component files into an aliased UI workspace. [Monorepo documentation](https://ui.shadcn.com/docs/monorepo).

The current implementation groups files by the known target alias keys `components`, `ui`, `lib`, and `hooks`. It does not inspect an arbitrary target such as `~/packages/cms-drupal/auth.ts` and infer that related package operations belong in `packages/cms-drupal`. [Workspace add implementation](https://github.com/shadcn-ui/ui/blob/main/packages/shadcn/src/utils/add-components.ts).

That distinction matters for Next Hydra:

| Registry contribution | ShadCN behavior in one root invocation | Next Hydra implication |
| --- | --- | --- |
| Explicit `registry:file` target | Writes exactly under the root `cwd`; `registry:file` content is copied without code transforms | Use `~/apps/...` and `~/packages/...` targets for all owned files |
| `registryDependencies` | Recursively resolves and merges the whole graph | Let ShadCN traverse it for installation |
| `dependencies` / `devDependencies` | Installs with the package manager in the invocation config's `resolvedPaths.cwd`; in ShadCN's special UI-workspace mode, global dependencies go to the selected UI workspace | Do not expect target file paths to route npm dependencies to arbitrary Next Hydra packages; keep `meta.nextHydra.packages` for package-specific edits |
| `envVars` | Updates an existing env file or `.env.local` under the same resolved project root | Suitable only when that one location is intentional; package/app-specific examples should remain explicitly targeted files, and real secrets should not be provisioned |
| Tailwind config, CSS, and CSS variables | Applied through the invocation's resolved ShadCN config (or its known UI workspace) | Do not use these fields to modify arbitrary Next Hydra packages without an explicit design for the target config |
| `docs` | Merged across the resolved graph and printed after installation | Works for Next Hydra's terminal setup instructions |

The installed 4.16.2 implementation confirms the package and environment boundaries: dependency installation passes `config.resolvedPaths.cwd` to the package manager, and environment updates start from `config.resolvedPaths.cwd`. Current upstream source shows the same behavior. [Dependency updater](https://github.com/shadcn-ui/ui/blob/main/packages/shadcn/src/utils/updaters/update-dependencies.ts), [environment updater](https://github.com/shadcn-ui/ui/blob/main/packages/shadcn/src/utils/updaters/update-env-vars.ts).

## Recommended architecture correction

1. Generate consumer targets from the workspace root: `~/${sourceRoot}/${relativePath}`.
2. Keep provider/app registry files colocated and keep their `path` entries local to those files.
3. Keep the top-level provider/add-on/preset graph in standard `registryDependencies`.
4. Invoke ShadCN once at the consumer workspace root for file installation and let it resolve the graph.
5. Keep a smaller Next Hydra wrapper around that call for behavior ShadCN does not express:
   - provider/add-on compatibility checks;
   - package-specific dependency edits from `meta.nextHydra.packages`;
   - maintainer-only removal of inactive Provider-owned application files;
   - binary asset copying and pnpm patches;
   - the customer-workspace confirmation policy.
6. Remove Install Unit `cwd` as an installation mechanism. If Install Units have no remaining user-facing purpose after the change, remove the concept rather than retaining it as metadata.

## Direct answer

Yes: the file-path problem is evidence that Next Hydra authored its ShadCN targets at the wrong level. Complete project-root-relative targets are closer to ShadCN's intended registry model and make its standard registry-dependency traversal useful again. The correct response is to simplify the wrapper, not to reproduce ShadCN's dependency traversal and current-working-directory management ourselves.

The boundary is that one ShadCN invocation still has one package/config context. Root-relative file targets solve multi-root **file placement**; they do not make ShadCN route npm dependencies, env variables, or config transforms to arbitrary workspaces. Next Hydra's typed metadata remains justified for those operations.
