# create-next-hydra

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
