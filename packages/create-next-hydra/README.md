# create-next-hydra

`create-next-hydra` composes a Next Hydra workspace from one Auth Provider, one CMS Provider, one Commerce Provider, and any compatible Add-ons. It uses [ShadCN registry items](https://ui.shadcn.com/docs/registry/registry-item-json) to copy code and adds Next Hydra's stack validation and package-specific manifest changes.

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
```

Use `--add-on <selection>` more than once to include compatible Add-ons. A selection can be an official shorthand, a local registry-item JSON file, a URL, a public GitHub address such as `owner/repository/item#ref`, or a configured ShadCN registry name.

The destination must be missing or empty. If scaffolding fails, the CLI leaves the partial project in place and reports what completed and what was not attempted.

## Change the maintainer workspace

The repository root is a Maintainer Workspace because it contains `next-hydra.json` and the source registry. Build the local CLI, then change a Provider or apply a Preset:

```bash
pnpm --filter create-next-hydra build
node packages/create-next-hydra/dist/cli.js use --cms contentstack
node packages/create-next-hydra/dist/cli.js use --preset standard
node packages/create-next-hydra/dist/cli.js use --check
```

`use` updates `next-hydra.json`, governed package entries, Provider-owned application files such as Next.js routes, and the lockfile. It does not remove canonical Provider or Add-on implementation source from the maintainer repository. If an operation fails, it leaves the Git diff in place for inspection or repair.

## Add code to a customer workspace

Run `add` from an existing customer-owned workspace:

```bash
pnpm dlx create-next-hydra@latest add owner/repository/drupal-dam
```

The command walks the complete registry dependency graph before ShadCN flattens it, rejects duplicate file targets, and lists every prospective file, package entry, and other ShadCN-managed effect. It verifies known Provider requirements through exact aliases in `apps/web/package.json` and labels compatibility requirements that cannot be proven without a customer receipt. The inspected graph is prepared locally so the exact approved artifacts are also the installation input. To keep that preview truthful, customer `add` accepts only explicitly targeted, exact-copy `registry:file` and `registry:item` file entries; file types that ShadCN would transform are rejected. It creates missing files, skips files ShadCN considers identical after newline and surrounding-whitespace normalization, and asks before replacing a changed file or dependency. Like ShadCN, `--yes` skips confirmation prompts and `--overwrite` authorizes replacing changed targets. Combine them for a fully non-interactive installation after reviewing the disclosed plan. `--yes` alone still refuses changed customer code. When package-specific entries change, `add` runs the root `pnpm install` to settle the lockfile and workspace links. The command never deletes files and does not retain a receipt.

Customer `add` accepts ordinary registry items and Next Hydra Add-ons. It does not switch Providers or apply Presets. In v1, an Add-on that declares separate binary assets or pnpm patches must be selected in a Maintainer Workspace or during a new scaffold.

## Author a Provider or Add-on

Keep source in its normal package or application directory and place a `registry.json` beside it. Add that registry file to the root `registry.json` `include` list. A registry containing Selection Definitions uses [`source-registry.json`](./schema/source-registry.json), which applies the complete [`selection-definition.json`](./schema/selection-definition.json) registry-item schema whenever an item contains `meta.nextHydra`. Ordinary registry items continue to use ShadCN's schema.

A Selection Definition declares:

- its stable ID and whether it is a Provider, Add-on, or Preset;
- a Provider Slot and one package `binding` when it is a Provider;
- an optional `binding.sourcePath` for resolving a maintained Provider directly to workspace source;
- `providerDependencies` for packages contributed by the selection that consume a Provider Slot;
- standard ShadCN `registryDependencies` for any other registry items it needs;
- required and conflicting selection IDs;
- ordinary exact package entries;
- exact pnpm patch entries and their patch-file assets; and
- setup instructions through the registry item's standard `docs` field.

Every copied registry file must have an explicit workspace-root target such as `~/packages/cms-drupal/src/index.ts`. The source `path` remains relative to the colocated registry, so maintainers edit and test canonical Provider code in its normal package or application.

When a Provider or Add-on needs to place a file outside its own source directory, keep that source under a colocated `registry/` directory using its final workspace path. For example, `packages/cms-drupal/registry/apps/web/app/api/draft/route.ts` is installed as `~/apps/web/app/api/draft/route.ts`. These files are ordinary ShadCN registry files: ShadCN installs them during scaffolding and customer `add`, while maintainer `use` may remove or replace their known targets when the selected stack changes.

Run these commands after adding, moving, or removing contribution files:

```bash
pnpm registry:sync
pnpm registry:check
```

`registry:sync` regenerates only each registry item's `files` list and its final workspace-root targets. Provider-owned metadata stays in the colocated registry file. Next Hydra first walks the intact `registryDependencies` graph to retain metadata and detect target conflicts, then prepares those exact artifacts and asks ShadCN to install them once from the workspace root.

Standard ShadCN `dependencies` and `devDependencies` apply to the workspace root. Use `meta.nextHydra.packages` only when an ordinary dependency must be added to a specific workspace package. Stable Provider aliases are derived from the slot and cannot be declared in `packages`.

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

An Add-on that contributes a package which imports the selected CMS declares the consumer, not a concrete CMS package:

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

Scaffold and maintainer `use` resolve that dependency to `@repo/cms` using the selected Provider's `binding.specifier`. If the Provider also declares `binding.sourcePath`, they write the exact alias and its `/*` wildcard into every selected consumer's `tsconfig.json` for direct-source development. Without `sourcePath`, pnpm's installed alias is the only resolution path and Next Hydra writes no TypeScript path override. Catalog-governed overrides are removed when they are no longer selected, and `use --check` reports incorrect or stale paths. Customer `add`, which has no retained selection receipt, copies the exact Provider alias already present in `apps/web/package.json` into each contributed consumer.

ShadCN reads registry source files as text. For a binary file that must survive byte-for-byte, or a root patch file referenced by `pnpmPatches`, an official or locally included source-registry selection may declare a typed `assets` source and target instead. Separately fetched external selections cannot contribute assets in v1.

ShadCN registry mappings, including private registry URLs and environment-backed headers, are read from the invoking workspace's `components.json` or `package.json`, used for both graph preflight and installation, and are not copied into a new scaffold. Secrets are never requested or generated by Next Hydra; registry `envVars` remain suitable only for safe placeholders or development defaults.

## Current limits

- Auth, CMS, and Commerce each require exactly one Provider.
- A scaffolded Customer Workspace has no composition receipt and cannot be automatically upgraded or switched later.
- Composition installs local code and JavaScript dependencies. Remote service setup, real secrets, Composer changes, Drupal module enablement, and deployed extensions remain manual.
- Selection Definitions are declarative and cannot run arbitrary hooks.
