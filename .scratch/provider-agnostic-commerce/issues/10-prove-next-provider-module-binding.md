# Prove the Next provider module binding

Type: prototype
Status: resolved
Blocked by: 09

## Question

Build the smallest throwaway proof that Next.js `16.1.6` with Turbopack replaces the exact `@repo/commerce/layers` import when that import originates inside the JIT `@repo/commerce` workspace package.

The fixture must cover a package-owned Server Component and a module-level package-owned `"use server"` action, both importing the stable core binding while the web application's `next.config.ts` aliases it to one app-owned Layers module. That module must export a fake provider capability Layer plus a fake `CommerceIdentity` Layer under the named core contract. Verify development compilation, `next build --turbopack`, Server Action manifest generation, standalone TypeScript checking against the unconfigured core module, and failure behavior without the alias. Confirm that `apps/web` declares both packages directly and that `@repo/commerce` has no dependency on or source import from `@repo/commerce-commercetools` or the selected auth package.

Record whether Vitest or other non-Next consumers need a parallel exact alias for boundary-level tests. Do not implement the production package split or introduce a runtime fallback during this prototype.

## Answer

The exact compile-time binding works with the current Next.js `16.1.6`, Turbopack, and JIT workspace-package setup.

The successful shape is:

```text
packages/commerce/package-owned-boundary.ts
  imports "@repo/commerce/layers"
              │ exact Turbopack alias
              ▼
apps/web/lib/commerce-layers.ts
  exports the app-selected named Layers
```

The package-owned import must use the exact bare specifier `@repo/commerce/layers`. A relative import such as `../layers` deliberately stays inside `@repo/commerce` and therefore reaches the unconfigured core module; Turbopack cannot substitute an import the alias does not name.

Proof results:

- `pnpm --filter @repo/commerce typecheck` passed with the unconfigured core binding present, so core remains independently type-checkable.
- The unconfigured binding failed with the explicit tagged `CommerceLayersNotConfigured` error. This proves a missing application binding is visible instead of silently choosing an implementation.
- `pnpm --filter @repo/commerce exec vitest run provider-binding-prototype/layers.test.ts` passed. The test mocked the `server-only` marker and asserted the missing-binding error.
- Next development compilation served `/en-US/provider-binding-probe` with HTTP `200`. The package-owned Server Component rendered `app-provider:app-identity`, proving that both fake app-selected Layers replaced the core binding.
- `next build --turbopack` completed production compilation successfully and emitted the probe route and Server Action artifacts. The overall application build later stopped during prerender because the fake Commercetools environment could not resolve a real Store for the existing Checkout route; that happens after and independently of the binding compilation.
- The production `server-reference-manifest.json` registered `runProviderBindingProbe` from `packages/commerce/provider-binding-prototype/actions.ts` and assigned it to `app/[locale]/provider-binding-probe/page`. The emitted server chunk contains the two app-selected Layer values and the package-owned action. A package-owned module-level `"use server"` action therefore survives the alias and is not duplicated in `apps/web`.
- The current `apps/web` directly declares `@repo/commerce` and the selected auth package. `@repo/commerce-commercetools` does not exist yet, so its direct application dependency cannot exist until the extraction commit creates it. Adding both `@repo/commerce` and `@repo/commerce-commercetools` to `apps/web` is an explicit migration gate; core must not depend on or import either the provider package or selected auth package.

Non-Next tests do not receive `next.config.ts` aliases. Ordinary core Service tests should provide their test Layers directly and should not import the application binding. A Vitest test specifically exercising an application boundary must configure the same exact alias; a core test checking the unconfigured failure can instead mock `server-only` and use the core module unchanged.

The prototype source is throwaway. Keep only this evidence and the implementation decision: expose one core-owned `@repo/commerce/layers` binding, select it with one exact alias in `apps/web/next.config.ts`, and implement the selected named Layers in `apps/web/lib/commerce-layers.ts`. Do not add a `next/` directory, `next-` filename prefix, runtime registry, or global runtime.
