# Provider-Agnostic Commerce Packages

Type: wayfinder:map
Status: complete

## Destination

Produce an implementation-ready specification and incremental migration sequence for separating commerce into two packages:

- `@repo/commerce` owns provider-agnostic domain models, Effect Services, provider-independent orchestration, and reusable presentation or framework integration code that depends only on those models and Services.
- `@repo/commerce-commercetools` owns every Commercetools implementation detail, including provider Layers, clients and configuration, SDK and GraphQL operations, provider response decoding, query and mutation construction, schema generation, Custom Type tooling, and provider migrations.

Applications select the Commercetools Layers at composition roots while consuming only `@repo/commerce` domain and use-case surfaces elsewhere. Reaching the destination means `@repo/commerce` has no Commercetools dependencies, generated provider types, provider query language, provider identifiers used only for query mechanics, or imports from `@repo/commerce-commercetools`; provider implementations translate into domain models defined by `@repo/commerce`. Product discovery and catalog behavior, Cart, Checkout, Commerce Accounts, Address Book, Store resolution, and Registration-facing commerce capabilities all obey that boundary. A second production commerce provider is not required, but replacing the Commercetools Layers must not require changes to application behavior.

## Notes

- This is a planning map. Resolve architecture and migration decisions; do not implement the package split or Effectify Product Discovery until an implementation-ready specification is complete.
- Use Effect-native vocabulary: `Context.Service`, Service, Layer, Effect program, and Layer composition. Avoid generic adapter, port, repository-interface, or plugin terminology where the concrete Effect concept is known.
- Consult `effect-solutions` before proposing Effect patterns. The relevant guidance starts with `services-and-layers`, `data-modeling`, `error-handling`, `testing`, and `config`.
- Use the deep-module test throughout: provider mechanics should be concentrated behind small, stable commerce Services rather than redistributed through provider-shaped domain types.
- Product discovery and catalog are the leading next implementation slice because the current public inputs and orchestration expose Commercetools search predicates, Product Projections, Product Selections, distribution-channel IDs, supply-channel IDs, and GraphQL fragments. The map still decides the exact slice boundary before implementation begins.
- A Store key, Business Unit ID, Customer ID, Product ID, Variant ID, or other domain identity is not provider leakage merely because Commercetools also uses it. Numeric resource versions, provider query strings, channel IDs used as pricing or inventory mechanics, SDK shapes, GraphQL fragments, Custom Type representations, and provider error inspection are provider details.
- Preserve the completed `CurrentCart`, `Carts`, `CommerceContext`, `CommerceAccounts`, `AddressBook`, and `CheckoutSession` Service decisions. This effort may relocate their Commercetools Layers but must not reopen their established domain contracts without concrete evidence of leakage.
- The destination permits React integration in `@repo/commerce`. Whether Next-specific request access, Server Actions, cache directives, metadata, navigation, and revalidation belong there is an open package-boundary decision, not an assumption.
- The physical package split is the final proof of the boundary, not the first move. First deepen remaining seams so moving provider files does not leave dependency cycles or provider types in `@repo/commerce`.
- Refer to this map and its tickets by name in user-facing discussion.

## Decisions so far

- [Remaining provider leakage and dependency graph](issues/01-remaining-provider-leakage-and-dependency-graph.md) — Six ordered clusters remain: Product Catalog and Store runtime leakage first, then provider infrastructure, provider tooling, Registration implementations, and finally application composition plus the physical package split.
- [Core and provider package ownership](issues/02-core-and-provider-package-ownership.md) — Core commerce owns provider-neutral models, Services, orchestration, Store configuration, and co-located test Layers. The Commercetools package owns provider mechanics and is organized into explicit capability modules whose public interfaces are Effect Layers; applications compose those Layers only at runtime and provider-tooling roots, with import and dependency checks enforcing the direction.
- [Product Catalog domain language and model](issues/03-product-catalog-domain-language-and-model.md) — Product Card and Product Detail are schema-backed commerce projections over typed, purchasable Variants. Public generated Effect Schemas preserve Product-Type-specific Attribute autocomplete, while provider Layers hide catalog eligibility, price, availability, localization, and raw Product Type mechanics.
- [Store and catalog context](issues/04-store-and-catalog-context.md) — The request boundary resolves a provider-neutral Store and builds the single Commerce Context; the Commercetools Product Discovery Layer privately resolves Store resources, catalog eligibility, pricing, and availability while exposing only context-resolved Product models.
- [Non-catalog provider capabilities and tooling](issues/05-non-catalog-provider-capabilities-and-tooling.md) — Commercetools clients, configuration, capability Layers, Registration and versioned-storage implementations, schema tooling, migrations, CLI code, and provider tests move behind explicit provider-package exports, with only generated provider-neutral Product Attribute Schemas written into core.
- [React and Next integration ownership](issues/06-react-and-next-integration-ownership.md) — `@repo/commerce` owns complete Cart, Checkout, Product, and Buying Context Next slices, including their actual Server Actions, request-time Service execution, metadata, revalidation, localization, and design-system projection. Apps only validate route segments, mount package slices, and supply aliased named `@repo/commerce/layers` from `apps/web/lib/commerce-layers.ts`; no `next/` namespace, action facades, generic Effect runner, or buyer-unsafe Product cache is introduced.
- [Product Discovery Service and provider Layer contract](issues/07-product-discovery-and-provider-layer-contract.md) — Core `ProductDiscovery` exposes only `findBySlug(ProductSlug)` and `listCards({ categoryId?, limit, excludeProductId? })`, with `Option` for normal detail absence, one operation-scoped failure type, bounded title-ordered cards, and a co-located test Layer. The Commercetools product module owns the Layer, structured queries, Store/selection/channel mechanics, context-resolved price and availability, domain decoding, malformed-projection policy, and provider tests.
- [Provider composition and package extraction sequence](issues/08-provider-composition-and-package-extraction-sequence.md) — Web binds one app-owned `commerce-layers.ts` module of named identity/provider Layers; API and CLI import provider capability/tooling modules at their own composition roots. A 22-commit green sequence proves the alias first, switches applications through a temporary provider-to-core compatibility shell, deepens Product/Store and package-owned Next slices, moves each provider cluster with its tests, purges core, and locks dependency/import/generated-artifact boundaries.
- [Next commerce provider binding](issues/09-next-commerce-provider-binding.md) — `apps/web` selects the installed provider and request-identity implementation at build time with one exact Turbopack alias from the core-owned `@repo/commerce/layers` binding to `apps/web/lib/commerce-layers.ts`. Package-owned Server Components and Server Actions remain implemented once in core, compose the aliased unbuilt named Layers with a fresh request Layer, and require no instrumentation registry, process runtime, provider-specific wrapper, or premature `next/` namespace.
- [Prove the Next provider module binding](issues/10-prove-next-provider-module-binding.md) — Next.js `16.1.6` and Turbopack replace the exact bare `@repo/commerce/layers` import even when it originates in the JIT core package. Development rendered the app-selected Layers, production compilation emitted the package-owned Server Action in the server-reference manifest, standalone core typechecking passed, and the unconfigured module failed explicitly. Non-Next boundary tests need their own exact alias; normal Service tests provide test Layers directly.

## Not yet specified

- Nothing remains at the architecture-map level. The resolved decisions are ready to graduate into `spec.md`; implementation discoveries may create ordinary follow-up issues without reopening the package boundary by default.

## Out of scope

- Implementing Shopify, Saleor, Medusa, or another second production commerce provider.
- A runtime provider registry, dynamic provider discovery, or provider selection inside commerce Service methods; normal Effect Layer composition is sufficient.
- Redesigning CMS, design-system primitives, Registration domain behavior, or Checkout behavior unless a current provider dependency prevents the package boundary.
- Changing storefront Product Catalog behavior, pricing, inventory, or Cart semantics as an accidental side effect of extraction.
