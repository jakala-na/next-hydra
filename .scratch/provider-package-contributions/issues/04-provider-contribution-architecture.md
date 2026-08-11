# Test provider switching

Type: prototype
Status: resolved
Blocked by: 03

## Question

Build the smallest proof that can distinguish generated application adapters from a stable dispatcher for maintainer-workspace provider switching while exercising provider bundles and compatible add-ons, without treating copied customer code as CLI-owned.

Keep the mechanism generic across CMS and Commerce. Use the real Drupal and Contentstack route/configuration shapes and exercise `Drupal -> Contentstack -> Drupal` by changing the aliased dependency and running the required package-manager install. Add the smallest fake second Commerce provider, sidecar app, and compatible cross-provider add-on needed to prove multi-application and multi-package composition without implementing another production Commerce integration.

Prototype self-describing top-level ShadCN `registry:item` selections with `meta.nextHydra`, root-scoped Install Units executed through the documented `shadcn/registry` API, a resolve-and-validate composition plan, package-manifest updates, and preview/diff behavior across two safety contexts:

- explicitly identified Generated Adapters inside the ordinary Maintainer Workspace that the CLI may regenerate during repeated Provider and Add-on switching; and
- an existing project whose copied source is customer-owned and may only receive additive writes after conflict checks and explicit confirmation.

Cover exact route sets, compatibility filtering, collision failure, preservation of customer-owned edits, package-manager failure reporting, and deterministic plans. Do not require automatic deletion or restoration of copied project files when switching providers.

Compare the smallest viable generated-shim design with the smallest viable dispatcher design inside the disposable workspace. Produce a rough artifact for human reaction; do not implement the production system or `create-next-hydra` integration.

## Comments

- A throwaway human-checkpoint prototype informed this decision and was deliberately discarded after the generated-route approach was selected. The retained findings are summarized below; the prototype is not part of the implementation or repository tooling.
- It calls the documented `shadcn/registry` API with a resolved universal `registry:item`, while the prototype wrapper separately validates Provider/Add-on compatibility, route claims, root-specific package changes, and package-manager failure recovery.
- The two route mechanics expose the same public provider route set differently: generated shims materialize the selected Provider's exact App Router entries; the dispatcher keeps one application-owned catch-all entry and changes the provider-owned route table behind it.
- The human checkpoint selected generated routes. A shared catch-all dispatcher is too likely to conflict with another application or integration that needs the same broad route space.
- The disposable proof completed real `pnpm install` runs for `Drupal -> Contentstack -> Drupal` and restored both `package.json` and `pnpm-lock.yaml` after a real package-manager failure caused by an unresolved workspace dependency.
- Later architecture clarification: rollback was an agent-introduced prototype constraint, not a maintainer-workspace requirement. The proof remains evidence that rollback is technically possible for those two files, but the selected architecture only requires clear failure reporting and safe retry.

## Answer

Use deterministic, generated App Router route shims inside the ordinary Maintainer Workspace. Each resolved Provider contributes its exact method-and-path claims; the resolver rejects duplicate claims before writing, regenerates only explicitly identified route files, updates the stable package alias, and runs `pnpm install`. Drupal therefore materializes its six current route entries, while Contentstack materializes its two, without reserving a shared catch-all route. The stable dispatcher option is rejected because it claims broad application routing space and can conflict with other catch-all routes.

The prototype confirmed that one composition plan can include Provider packages, a sidecar application, a compatible cross-provider Add-on, and a transitively required Add-on. A deterministic plan digest and full preflight make collisions and incompatible selections fail before writes. It also exercised package-manifest and lockfile restoration, but later architecture work established that rollback is optional rather than part of the maintainer-workspace contract.

Use the documented `shadcn/registry` API only to materialize the resolved source files and show their setup instructions. The Next Hydra layer remains responsible for selection resolution, compatibility, route claims, root-specific package-manifest changes, install ordering, and failure handling.

This regeneration contract applies only to Generated Adapters that Next Hydra explicitly identifies as derived output in the Maintainer Workspace. It does not make the whole repository disposable. In a Customer Workspace, copied files are customer-owned: the CLI may preview and add non-conflicting files after confirmation, but it must not switch Providers by deleting or overwriting existing source.
