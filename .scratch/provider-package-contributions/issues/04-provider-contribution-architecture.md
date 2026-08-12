# Test provider switching

Type: prototype
Status: resolved
Blocked by: 03

## Question

Build the smallest proof that can distinguish exact application route files from a stable dispatcher for maintainer-workspace provider switching while exercising provider bundles and compatible add-ons, without treating copied customer code as CLI-owned.

Keep the mechanism generic across CMS and Commerce. Use the real Drupal and Contentstack route/configuration shapes and exercise `Drupal -> Contentstack -> Drupal` by changing the aliased dependency and running the required package-manager install. Add the smallest fake second Commerce provider, sidecar app, and compatible cross-provider add-on needed to prove multi-application and multi-package composition without implementing another production Commerce integration.

Prototype self-describing top-level ShadCN `registry:item` selections with `meta.nextHydra`, a resolve-and-validate composition plan, package-manifest updates, and preview/diff behavior across two safety contexts. The prototype originally invoked ShadCN once per working root; later registry-target testing replaced that mechanism with explicit workspace-root targets and one root invocation:

- explicitly identified Provider-owned application files inside the ordinary Maintainer Workspace that the CLI may replace during repeated Provider and Add-on switching; and
- an existing project whose copied source is customer-owned and may only receive additive writes after conflict checks and explicit confirmation.

Cover exact route sets, compatibility filtering, collision failure, preservation of customer-owned edits, package-manager failure reporting, and deterministic plans. Do not require automatic deletion or restoration of copied project files when switching providers.

Compare the smallest viable generated-shim design with the smallest viable dispatcher design inside the disposable workspace. Produce a rough artifact for human reaction; do not implement the production system or `create-next-hydra` integration.

## Comments

- A throwaway human-checkpoint prototype informed this decision and was deliberately discarded after exact route files were selected. The retained findings are summarized below; the prototype is not part of the implementation or repository tooling.
- It calls the documented `shadcn/registry` API with a resolved universal `registry:item`, while the prototype wrapper separately validates Provider/Add-on compatibility, file targets, package-specific changes, and package-manager failure recovery.
- The two route mechanics expose the same public Provider route set differently: explicit route files materialize the selected Provider's exact App Router entries; the dispatcher keeps one application-owned catch-all entry and changes the Provider-owned route table behind it.
- The human checkpoint selected exact route files. A shared catch-all dispatcher is too likely to conflict with another application or integration that needs the same broad route space.
- The disposable proof completed real `pnpm install` runs for `Drupal -> Contentstack -> Drupal` and restored both `package.json` and `pnpm-lock.yaml` after a real package-manager failure caused by an unresolved workspace dependency.
- Later architecture clarification: rollback was an agent-introduced prototype constraint, not a maintainer-workspace requirement. The proof remains evidence that rollback is technically possible for those two files, but the selected architecture only requires clear failure reporting and safe retry.

## Answer

Use explicit App Router route files inside each Provider's ShadCN registry contribution. Their final targets identify the exact application paths the Provider needs, so ordinary file-target conflict detection rejects two different files targeting the same `route.ts`. Maintainer `use` removes known application-file targets for inactive selections, asks ShadCN to install the selected graph, updates the stable package alias, and runs `pnpm install`. Drupal therefore materializes its six current route entries, while Contentstack materializes its two, without reserving a shared catch-all route. The stable dispatcher option is rejected because it claims broad application routing space and can conflict with other catch-all routes.

The prototype confirmed that one composition plan can include Provider packages, a sidecar application, a compatible cross-provider Add-on, and a transitively required Add-on. A deterministic plan digest and full preflight make collisions and incompatible selections fail before writes. It also exercised package-manifest and lockfile restoration, but later architecture work established that rollback is optional rather than part of the maintainer-workspace contract.

Use the documented `shadcn/registry` API to materialize the resolved source files, including exact route files, and show their setup instructions. The Next Hydra layer remains responsible for selection resolution, compatibility, catalog-wide managed-target inventory, package-specific manifest changes, install ordering, and failure handling.

This replacement contract applies only to registry files whose explicit targets lie outside their Provider or Add-on source root in the Maintainer Workspace. It does not make the whole repository disposable. In a Customer Workspace, copied files are customer-owned: the CLI may preview and add non-conflicting files after confirmation, but it must not switch Providers by deleting or overwriting existing source.
