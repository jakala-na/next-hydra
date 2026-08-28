---
"create-next-hydra": minor
---

Add stable Provider bindings and consumer-declared Provider dependencies to composition.

Provider Selection Definitions declare one `binding.specifier`, while contributed consumers declare their package directory, dependency section, and Provider Slot through `providerDependencies`. Maintained workspace Providers can also declare `binding.sourcePath` so scaffold and maintainer composition reconcile direct-source TypeScript paths in every selected consumer.

Providers without a source path use normal pnpm resolution, and customer `add` resolves contributed Provider dependencies from the stable aliases already installed in the workspace.
