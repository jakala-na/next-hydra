# ShadCN file-target and conflict behavior

Research snapshot: 2026-08-11. Current `shadcn/ui` `main` was inspected at commit [`41bbc12`](https://github.com/shadcn-ui/ui/tree/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612).

## Decision summary

`shadcn add` is a good fit for **additive copied-source installation**:

- a missing target is created;
- a target whose prospective content is identical is skipped;
- a changed existing target is never silently merged: interactive `shadcn add` prompts unless `--overwrite` is set, while the programmatic API skips it unless `overwrite: true` is set;
- `--overwrite` replaces the complete file rather than performing a three-way or structural merge;
- dry-run, diff, and view provide useful pre-write visibility;
- ShadCN records no installed-item ownership receipt and provides no general registry-item removal command.

For Next Hydra customer projects, provider contributions should therefore prefer new, provider-owned target files and treat any changed existing target as a disclosed customer-owned conflict. Interactive installation asks before replacement; an explicit `--overwrite` authorizes the same whole-file replacement that ShadCN exposes.

## How the final target is chosen

Conflict checks operate on the **resolved filesystem path**, not merely the registry item's source `path`:

1. `--path` wins first. A file-looking path applies to the first item file; a directory places all item files there by basename.
2. Otherwise an explicit `target` is resolved from the command `cwd`, `~/`, or a supported ShadCN alias.
3. Otherwise the item type selects the configured `components`, `ui`, `lib`, or `hooks` directory.

The resolver also accounts for `src` layout and framework/page conventions before checking the destination ([target resolution](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/packages/shadcn/src/utils/updaters/update-files.ts#L386-L505)). Registry-controlled `target`/`path` values containing traversal or resolving outside `cwd` are rejected ([path safety](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/packages/shadcn/src/utils/is-safe-target.ts#L3-L97), [validation call](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/packages/shadcn/src/utils/add-components.ts#L452-L470)). By contrast, the user's explicit `--path` may itself be absolute; it is treated as the requested destination before registry target resolution ([source](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/packages/shadcn/src/utils/updaters/update-files.ts#L397-L417)).

The content comparison uses the **prospective installed content after ShadCN transforms and import rewriting**, except universal `registry:file`/`registry:item` files, which preserve their supplied content ([writer](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/packages/shadcn/src/utils/updaters/update-files.ts#L164-L223)). “Identical” normalizes CRLF to LF and trims leading/trailing whitespace; ShadCN's special workspace mode may additionally ignore differences between non-relative import aliases ([comparison](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/packages/shadcn/src/utils/compare.ts#L1-L60)).

## Exact standard-file outcomes

| Destination state | Interactive `shadcn add` | `shadcn add --overwrite` | `addRegistryItems` default |
| --- | --- | --- | --- |
| Missing | Creates parent directories and writes the file. | Same. | Same. |
| Existing, identical | Skips without prompting. | Still skips because equality is checked first. | Skips. |
| Existing, changed | Prompts `Would you like to overwrite?`, defaulting to `false`; declining skips. | Writes the complete prospective content over the target without prompting. | Non-interactive, so skips unless `overwrite: true` is passed. |
| Existing directory at target | Aborts with an error. | Same. | Same. |

These branches are implemented directly in the writer: directory rejection, equality skip, interactive confirmation, skip behavior, and final whole-file `writeFile` ([source](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/packages/shadcn/src/utils/updaters/update-files.ts#L157-L162), [source](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/packages/shadcn/src/utils/updaters/update-files.ts#L200-L298)). The public `addRegistryItems` API explicitly forces non-interactive mode and exposes `overwrite` as an option ([source](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/packages/shadcn/src/registry/add.ts#L12-L23), [source](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/packages/shadcn/src/registry/add.ts#L73-L101)).

`--yes` is not an overwrite policy. The CLI exposes `--yes` separately from `--overwrite`, and only `--overwrite` is described as overwriting existing files ([CLI options](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/packages/shadcn/src/commands/add.ts#L37-L66)).

### Specialized exceptions

- Existing `.env` files do not use the standard overwrite prompt. ShadCN merges only missing keys, skips when there are no new keys, and preserves existing values ([source](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/packages/shadcn/src/utils/updaters/update-files.ts#L226-L231), [source](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/packages/shadcn/src/utils/updaters/update-files.ts#L269-L283)).
- CSS, CSS variables, Tailwind configuration, fonts, and imports use ShadCN-specific transformers. They should not be generalized into a claim that arbitrary JSON, YAML, or source files are structurally merged.

## Preview modes

`add` exposes `--dry-run`, `--diff [path]`, and `--view [path]`; diff and view imply dry-run ([CLI options](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/packages/shadcn/src/commands/add.ts#L37-L77)). In this branch the command resolves and transforms the item tree, prevents registry-config writes, formats the result, and returns before the installer runs ([source](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/packages/shadcn/src/commands/add.ts#L279-L315)).

- `--dry-run` labels files `create`, `overwrite`, or `skip (identical)` and reports dependencies, CSS, environment variables, and fonts. Any changed existing target is classified as `overwrite` for preview, even though a real run without `--overwrite` will still ask before replacing it ([classification](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/packages/shadcn/src/utils/dry-run.ts#L165-L255), [summary](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/packages/shadcn/src/utils/dry-run-formatter.ts#L84-L140)).
- `add ... --diff` shows a unified diff for changed content, additions for a new file, and `No changes` for an identical file. A path can focus the output; without one it previews up to five files ([formatter](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/packages/shadcn/src/utils/dry-run-formatter.ts#L143-L231), [formatter](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/packages/shadcn/src/utils/dry-run-formatter.ts#L278-L299)). The older top-level `shadcn diff` command is deprecated in favor of this form ([source](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/packages/shadcn/src/commands/diff.ts#L41-L50)).
- `add ... --view` shows the prospective installed file contents after resolution/transforms and can be path-focused; without a path it previews up to five files ([formatter](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/packages/shadcn/src/utils/dry-run-formatter.ts#L234-L275)). This differs from the separate `shadcn view`, which prints fetched registry item JSON rather than a project-specific install preview ([source](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/packages/shadcn/src/commands/view.ts#L19-L72)).

## No ownership receipt or general removal

ShadCN's strict `components.json` schema records design configuration, aliases, registry endpoints, and resolved paths, but no installed registry item/version/file ledger ([schema](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/packages/shadcn/src/registry/schema.ts#L28-L75)). Its command list has no general `remove` or `uninstall` command for registry items ([command surface](https://github.com/shadcn-ui/ui/blob/41bbc12cfd39ed8d9cb8da04275479ee7ecc0612/packages/shadcn/src/index.ts#L23-L50)). `eject` is a special command for inlining ShadCN's Tailwind CSS dependency, not an item-removal system.

Consequently, ShadCN cannot prove that a file is unchanged since installation, distinguish provider-owned output from later customer edits, or safely infer which files and dependencies should be deleted when a provider is removed.

## Next Hydra policy implication

For additive customer installs:

1. Prefer contributions that create new provider-owned route, adapter, and configuration files.
2. Preflight the complete requested item graph and surface create/identical/conflict results before applying.
3. Treat identical targets as idempotent success.
4. Treat changed existing targets as customer-owned conflicts: require an explicit per-file decision by default, while exposing ShadCN-compatible `--overwrite` for users who intentionally authorize every disclosed replacement.
5. Do not implement provider removal by deleting the files currently named by its registry item. There is no provenance proving those files are still disposable.

For a maintainer's explicitly disposable generated workspace, rebuilding the generated root or using overwrite can be reasonable because disposability comes from the workspace contract—not from ShadCN ownership metadata.
