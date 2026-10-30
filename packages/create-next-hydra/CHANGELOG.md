# create-next-hydra

## 0.5.0

### Minor Changes

- 2bdda76: Support native TypeScript/TSX composition templates using LiquidJS comment directives, with diagnostics for invalid template references.

  Display grouped, selection-specific setup instructions after project creation, composition, and registry installation.

  Breaking: source composition templates must use the new comment-based syntax.

## 0.4.3

### Patch Changes

- 872863a: Support pnpm 12 when creating and refreshing workspaces. Preserve the package-manager lockfile document while selecting application dependencies, and recognize pnpm configuration environment variables when deciding whether to reinstall dependencies.

  New workspaces also deduplicate nested peer variants so application middleware shares the same Next.js runtime classes.

## 0.4.2

### Patch Changes

- 7f11f69: Pin the shared Node runtime to the matching Effect prerelease so fresh CLI installs start successfully instead of failing with a missing ChildProcess module. Validate packed CLI startup and composition with freshly resolved dependencies before release.

## 0.4.1

### Patch Changes

- 749064e: Fix Compose Watch missing package additions and removals when Linux reports only the directory change. Reconcile structural notifications against Git-visible inputs while continuing to ignore unselected source changes.

## 0.4.0

### Minor Changes

- e562eb2: Update the CLI for the current registry contract: Search providers, package/recipe kinds, conditional dependencies, and provider requirements. Scaffolding now materializes only selected applications and packages, including CMS-only compositions.

  Add named-workspace `compose` with safe refresh, watching, file checks, diffs, source explanations, and opt-in environment copying. Registry additions validate the complete dependency graph before installation.

  Breaking: `compose` replaces `use`; programmatic composition exports are replaced by the Effect-backed `cliProgram`/`runCli` entry points. See the CLI README for migration and command options.

## 0.3.0

### Minor Changes

- b6d86b2: Add stable Provider bindings and consumer-declared Provider dependencies to composition.

  Provider Selection Definitions declare one `binding.specifier`, while contributed consumers declare their package directory, dependency section, and Provider Slot through `providerDependencies`. Maintained workspace Providers can also declare `binding.sourcePath` so scaffold and maintainer composition reconcile direct-source TypeScript paths in every selected consumer.

  Providers without a source path use normal pnpm resolution, and customer `add` resolves contributed Provider dependencies from the stable aliases already installed in the workspace.

## 0.2.1

### Patch Changes

- ee9bdcf: Restore the Next Hydra Selection schema marker after ShadCN resolves registry artifacts.

## 0.2.0

### Minor Changes

- a2f46d2: Introduce composable project scaffolding and existing-workspace installation workflows.

  New projects can choose Auth, CMS, and Commerce providers individually, apply a preset, and add compatible add-ons through interactive or non-interactive flows. Maintainers can preview, apply, or check composition changes with `create-next-hydra use`, while customer-owned projects can inspect and install registry items with `create-next-hydra add`.
