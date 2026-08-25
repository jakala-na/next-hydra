# Next commerce provider binding

Research target: Next.js `16.1.6`, Effect `4.0.0-beta.67`, and the current Next Hydra JIT package layout.

## Recommendation

Select the installed commerce provider and request-identity implementation at build time through one exact host-owned module alias:

```text
@repo/commerce/layers
  -> apps/web Turbopack alias
  -> apps/web/lib/commerce-layers.ts
       -> named @repo/commerce-commercetools capability Layers
       -> WorkOS CommerceIdentity Layer
```

`@repo/commerce` owns the named Layer contract, unconfigured server-only bindings, the provider-neutral `CommerceIdentity` Service, and every reusable commerce boundary. The provider package exports immutable, unbuilt capability Layers. One app-owned module exports the selected Layers together with the WorkOS-backed identity Layer. `apps/web/next.config.ts` aliases the core binding to that module.

This preserves the two-package destination and the existing package-owned integration ergonomics:

- Checkout and Cart Server Actions are implemented once in `@repo/commerce`;
- Product Collection, Product Detail, Checkout, metadata, and CMS commerce blocks can import provider-neutral commerce entrypoints directly;
- the app adds no action facade or Layer prop;
- `@repo/commerce` has no package or source dependency on `@repo/commerce-commercetools`;
- provider selection is static and visible in application build configuration; and
- request state remains inside a fresh Effect request scope.

## Exact package and build shape

`@repo/commerce/layers` is a real core module so standalone core typechecking resolves the import. It exports the named core-owned Layer contract and unconfigured values with the same interfaces. Executing them outside a configured host must fail with a named composition error. No `next/` namespace is added while Next is the only host in this starter kit.

`@repo/commerce-commercetools/provider` combines the concrete capability Layers required by reusable Next commerce entrypoints and exports:

```ts
export const commerceProviderLayer = layerCommercetools
  satisfies CommerceProviderLayer
```

`apps/web/lib/commerce-layers.ts` imports the named capability Layers and supplies the WorkOS implementation of the core-owned `CommerceIdentity` Service. Resolving the current session still occurs only when that identity Layer is built for a request. The Layers stay separate because Commerce Accounts is required to build Commerce Context while Address Book and Product Discovery require the resulting Context. `@repo/commerce` cannot import `@repo/auth-workos` directly because the existing `auth-workos -> registration -> commerce` path would create a dependency cycle.

`apps/web` declares both workspace packages directly. Its Next configuration merges one exact alias without replacing aliases installed by other config wrappers:

```ts
turbopack: {
  ...nextConfig.turbopack,
  resolveAlias: {
    ...nextConfig.turbopack?.resolveAlias,
    "@repo/commerce/layers":
      "./lib/commerce-layers.ts",
  },
}
```

Next documents `turbopack.resolveAlias` as the supported way to map an imported module specifier to another module. The remaining uncertainty is narrower: the documentation does not explicitly guarantee this exact self-package import replacement when the importing source is reached through the current `@repo/*` TypeScript path mapping. Ticket 10 isolates that behavior in a build prototype before implementation relies on it. [Next.js Turbopack configuration](https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopack).

Do not generate a provider re-export into `packages/commerce`. That would turn the generated artifact into a hidden core-to-provider dependency and create a package cycle because the provider package implements contracts from core. If starter-kit generation eventually selects the provider, it may write the host alias and app-owned Layer module instead.

## Boundary call graphs

```text
CheckoutPage
  -> package-owned saveCheckoutContact Server Action
  -> import named Layers from @repo/commerce/layers
     -> Turbopack substitutes apps/web/lib/commerce-layers.ts
     -> Commercetools capability Layers + WorkOS CommerceIdentity Layer
  -> compose named Layers + fresh request Layer
  -> Effect.provide once
  -> CheckoutSession.saveContact
  -> CurrentCart
  -> Carts
  -> Commercetools Layer
```

```text
CMS DynamicProductCollection
  -> @repo/commerce ProductCollection
  -> same aliased commerce Layer binding
  -> compose commerce Layer + fresh request Layer
  -> Effect.provide once
  -> ProductDiscovery
  -> Commercetools Layer
  -> provider-neutral Product Card projections
```

The Layer is unbuilt at module scope. Each page, action, metadata function, or block reads its own cookies, locale, verified identity, Store selection, and buying context while constructing the request Layer. Effect owns and closes everything acquired for that execution.

## Why runtime registration is superseded

The earlier design used `apps/web/instrumentation.ts` plus a versioned `Symbol.for(...)` slot on `globalThis` to make provider wiring reachable from separately emitted server entries. That design is no longer selected.

An exact build-time binding provides the same reachability without ambient mutable state, registration order, development replacement rules, per-realm assumptions, or a missing-registration race. `instrumentation.ts` remains reserved for actual Next instrumentation responsibilities.

Effect v3 `GlobalValue` would only standardize the global store; it would not change those semantics. The installed Effect v4 beta does not export it.

## Process and request lifetime

No process `ManagedRuntime` is required for this extraction. A package boundary constructs one cohesive Effect program, provides the merged provider and request Layer once, and lets the execution scope finalize it.

A request-local `ManagedRuntime` remains valid only when one Next request must run several independent Effects against the same constructed request Services. It must be created and disposed inside that request. Never place cookies, identity, Store selection, Commerce Context, Current Cart, Address Book, Product Discovery, or Checkout Session in a process-cached runtime.

Cross-request reuse of expensive provider resources is a separate optimization. Introduce it only with a host that owns both startup and shutdown and after measuring construction cost.

## Testing contract

- Domain and orchestration tests provide fresh Service test Layers directly and never depend on the provider binding.
- Provider integration tests import `@repo/commerce-commercetools` capability Layers directly.
- Boundary-level core tests alias the exact `@repo/commerce/layers` specifier to a test Layers module, or assert the named unconfigured failure when intentionally testing missing composition.
- `apps/web` build validation proves the production alias and package-owned Server Action manifest.
- The repository boundary check still forbids `@repo/commerce-commercetools` and `@repo/auth-workos` dependencies and import specifiers in `@repo/commerce`; the core-owned `@repo/commerce/layers` specifier is allowed.
- The web package must list both workspace packages so Turborepo pruning, dependency ordering, and cache inputs remain accurate.

## Rejected alternatives

- Provider-specific copies or wrappers of shared Server Actions duplicate boundary behavior or move reusable Next slices out of core.
- A provider Layer captured by an inline Server Action factory becomes a serialized closure value and cannot carry an Effect Layer.
- A runtime provider registry, whether hand-written or backed by `GlobalValue`, hides composition in ambient mutable state.
- A process `ManagedRuntime` still needs an explicit lifetime owner and does not choose a provider.
- Generating the concrete provider import into `@repo/commerce` creates the reverse package dependency the split is intended to prevent.
- Passing Layers through CMS or component props exposes infrastructure to presentation contracts.

## Remaining proof

Ticket 10 must prove exact Turbopack alias substitution for a package-owned Server Component and `"use server"` action imported from the current JIT workspace package. If that proof fails, reopen the composition decision; do not silently restore the runtime registry.
