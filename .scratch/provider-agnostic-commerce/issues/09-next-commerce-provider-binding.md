# Next commerce provider binding

Type: research
Status: resolved
Blocked by: 02, 04, 05

## Question

Research the most Effect-native and Next.js-correct way for package-owned commerce Server Components and package-level `"use server"` actions to reach the application-selected commerce provider Layers without per-action application facades, a core-to-provider dependency, or request state leaking across requests.

Compare concrete composition and lifetime options against primary Next.js 16 and Effect v4 guidance and source. Account for package-owned Server Action compilation, the JIT `@repo/commerce` package, process and request Layer lifetimes, multiple server instances, development reloads, tests, and failure behavior when application composition is missing.

The answer must recommend an exact composition root and call graph for this repository, or state what cannot be guaranteed and narrow the remaining decision.

## Answer

The primary-source research and superseded runtime-registry analysis are recorded in [Next commerce provider binding](../research/next-commerce-provider-binding.md).

Use one compile-time configured-commerce binding module. `@repo/commerce` owns a server-only `@repo/commerce/layers` module defining the named Layer contract and unconfigured implementations that fail clearly when no host binding exists. Package-owned Server Components, Server Actions, metadata functions, and commerce blocks import that stable specifier and retain their complete shared implementation in core. Do not add a `next/` namespace or `next-` filename while Next remains the starter kit's only host.

`@repo/commerce-commercetools/provider` exports immutable, unbuilt named capability Layers. One app-owned `commerce-layers.ts` module exports those selected Layers together with a WorkOS-backed implementation of the core-owned `CommerceIdentity` Service. `apps/web` declares both packages as dependencies and maps the exact core binding to that app-owned module through `turbopack.resolveAlias` in `next.config.ts`. This file is the single web commerce Layer-selection root; `@repo/commerce` never imports or declares a dependency on either `@repo/commerce-commercetools` or `@repo/auth-workos`.

The app-owned module is necessary because provider capability Layers alone cannot authenticate the current request, while a core import of `@repo/auth-workos` would create the current `auth-workos -> registration -> commerce -> auth-workos` dependency cycle. The Layers remain named rather than falsely merged: Commerce Accounts is needed to resolve Commerce Context, while Address Book and Product Discovery require that Context. Each commerce boundary composes the aliased Layers with a fresh request Layer, provides the complete graph once, executes its `CheckoutSession`, `CurrentCart`, `ProductDiscovery`, or other Service method, and closes the request scope. Do not use `instrumentation.ts`, `globalThis`, `GlobalValue`, a mutable provider registry, a generic Effect runner, or a process `ManagedRuntime` for provider selection.

Ticket 10 must prove that Next 16.1.6 Turbopack applies the exact alias to an import originating inside the JIT workspace package, resolves the app-owned target, and preserves package-owned Server Action compilation. If the spike fails, reopen this decision rather than adding runtime registration as a fallback.
