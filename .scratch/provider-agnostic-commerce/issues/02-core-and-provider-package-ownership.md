# Core and provider package ownership

Type: grilling
Status: resolved
Blocked by: 01

## Question

Define the enforceable ownership and dependency rule between future `@repo/commerce`, future `@repo/commerce-commercetools`, applications, and neighboring domain packages.

Specify what belongs in each package, which direction imports may flow, which package owns provider-neutral Service contracts and domain schemas, where provider Layer composition occurs, whether provider configuration may be re-exported through an application runtime, and what automated checks prove that `@repo/commerce` remains provider-agnostic. Resolve ambiguous shared artifacts such as Store mappings, product-attribute schemas, action contracts, HTTP schemas, test Layers, provider contract tests, and public package exports.

The answer must be concrete for this monorepo and Effect architecture. Do not settle for a generic clean-architecture layering diagram or begin by moving files.

## Confirmed decisions

- `@repo/commerce-commercetools` is the monorepo's complete Commercetools integration package. It may import contract-owning packages such as `@repo/commerce`, `@repo/registration`, and `@repo/versioned-store` to provide their Commercetools Layers. It owns provider mechanics only, not domain rules. Those contract packages must never import or re-export `@repo/commerce-commercetools`; applications import the provider package only at Layer composition and provider-configuration roots.
- Store identity and configuration remain in `@repo/commerce` because they are provider-neutral commerce concepts inherited by `CommerceContext`. `@repo/registration` may depend on `@repo/commerce` and consume `StoreKey` and Store configuration directly; package-to-package dependencies are allowed when they follow domain ownership. `@repo/commerce` also owns the provider-neutral product catalog and assortment-resolution capabilities. `@repo/commerce-commercetools` implements those capabilities by resolving Commercetools product selections and the channels used for prices and inventory.
- Test Layers are Effect-native parts of their provider-neutral Service definitions and remain co-located as `Service.testLayer` or `Service.testLayer(seed)`. Higher-level commerce orchestration uses its real domain Layer and is tested by supplying leaf Service test Layers. Non-provider test files, fixtures, and reusable test-only Layer compositions may live in an internal `testing/` folder in `@repo/commerce`; that folder is not a separate facade or public package API unless a concrete consumer later requires it.
- `@repo/commerce-commercetools` is organized by capability modules such as `cart/`, `commerce-accounts/`, `address-book/`, `product-catalog/`, `registration/`, and `versioned-store/`, plus provider tooling such as `client/`, `schema/`, `migrations/`, and `cli/`. Each capability module exposes its Effect Layer through an explicit module export; its queries, generated types, mappers, and raw clients remain implementation details. Do not add aggregate Layer bundles until repeated composition demonstrates a concrete need.
- Provider folders exist only where Commercetools actually implements a Service or owns provider tooling. They do not mechanically mirror `@repo/commerce`: `CurrentCart`, `CheckoutSession`, and checkout orchestration remain in core commerce; a provider `checkout/` or `payment/` module is introduced only for a provider capability that genuinely belongs there. Implementations for non-Commercetools payment providers belong in their own provider package.
- The Next application selects its installed provider and request-identity implementation at build time with an exact module alias from the core-owned `@repo/commerce/layers` binding to one app-owned commerce Layers module. That module exports the named Layers from `@repo/commerce-commercetools/provider` together with the WorkOS-backed `CommerceIdentity` Layer. This keeps package-owned Next boundaries implemented in core without adding a core-to-provider or core-to-auth dependency: `apps/web` declares both packages as dependencies and owns the alias and Layers file. No `next/` namespace is introduced while Next is the only application host.

## Effect guidance applied

- A provider-neutral capability is a `Context.Service` in `@repo/commerce`; its lightweight stateful test implementation is co-located on that Service as `static readonly testLayer` or a seeded `testLayer(...)` constructor.
- A higher-level commerce Service keeps its real orchestration Layer in `@repo/commerce`. Its tests supply the test Layers of its leaf Services rather than replacing the orchestration under test.
- A Commercetools implementation is a separately named Layer exported by `@repo/commerce-commercetools`. Its provider integration tests remain there.
- Tests receive fresh test Layer instances by default. Suite-shared Layers are reserved for genuinely expensive scoped resources.
- Do not introduce a package-wide `@repo/commerce/testing` facade or exported generic contract-test framework before a concrete need exists.

## Answer

### `@repo/commerce`

- Owns provider-neutral commerce schemas, errors, `Context.Service` contracts, domain orchestration Layers, Store configuration, policies, and provider-independent projections.
- Owns orchestration such as `CommerceContext`, `CurrentCart`, and `CheckoutSession`; their methods depend on Services through Effect context rather than accepting provider clients, identifiers, or raw effects.
- May own provider-neutral React, action, and HTTP integration modules when they depend only on core commerce models and Services. Ticket 06 will define their exact placement and interface.
- May be imported by applications and neighboring domain packages such as `@repo/registration`. Package dependencies are allowed when they follow domain ownership.
- Must not depend on, import, or re-export `@repo/commerce-commercetools` or any Commercetools SDK, GraphQL schema, generated provider type, query, mapper, client, credential schema, migration, or CLI implementation.

### `@repo/commerce-commercetools`

- Owns all Commercetools mechanics: SDK and GraphQL clients, configuration, queries, generated types, decoding and mapping, optimistic-concurrency handling, custom fields, schema/type generation, migrations, and provider CLI commands.
- Imports the package that owns each Service contract and supplies the corresponding Commercetools Layer. This includes `@repo/commerce`, `@repo/registration`, and `@repo/versioned-store`.
- Is organized by implemented capability modules. Each public module exposes the Layer needed at composition; its clients, queries, mappers, generated types, and helper Layers remain internal.
- Does not own provider-neutral commerce policy or orchestration merely because Commercetools is currently the only production provider.

### Composition and configuration

- Applications own final Layer composition because the API and Next.js applications have different request and transport boundaries.
- Applications may import `@repo/commerce-commercetools` only from dedicated Layer-composition, provider-configuration, migration, schema, or CLI roots. Route handlers, server actions, pages, components, and domain programs consume `@repo/commerce` Services instead.
- For package-owned Next boundaries, `apps/web/next.config.ts` maps the exact `@repo/commerce/layers` specifier to `apps/web/lib/commerce-layers.ts`. That module is the web commerce selection root: it imports the installed provider's named capability Layers and the selected request-identity implementation. The package source imports only the core-owned binding; the final app bundle substitutes the host Layers. The web package declares the provider package directly so Turborepo ordering, pruning, and dependency checks remain truthful.
- Provider credential/configuration schemas live in `@repo/commerce-commercetools`. An application environment module may import and combine those schemas as a provider-configuration root, but core commerce and ordinary application callers do not receive or re-export raw Commercetools clients or configuration.
- The Next binding may export one aggregate provider Layer because package-owned pages, actions, metadata functions, and commerce blocks are repeated concrete consumers of the same capability set. Provider tooling and non-Next applications may continue importing only the capability Layers they need.

### Ambiguous artifacts

- `StoreKey`, Store configuration, and locale-to-default-Store/currency resolution remain provider-neutral commerce concepts in `@repo/commerce`. Provider Store IDs, product-selection assignments, and price/inventory channel resolution belong in the Commercetools implementation.
- Provider-neutral product, variant, attribute, price, availability, cart, checkout, and account schemas belong in `@repo/commerce`; raw Commercetools projections and mapping code belong in `@repo/commerce-commercetools`. Tickets 03 and 04 define the exact catalog and assortment models.
- Provider-neutral action and HTTP schemas may remain in `@repo/commerce`; Next.js cookie/header access and API transport wiring remain application integration concerns unless ticket 06 identifies a reusable provider-independent module.
- Test Layers remain on their Service definitions. Non-provider test files and fixtures may live in `@repo/commerce/testing/`. Commercetools integration tests live beside their provider modules and exercise behavior through the Service interface; no exported generic contract-test framework is required.

### Enforcement

- Both packages use explicit `package.json` exports for supported module interfaces; callers cannot deep-import queries, mappers, clients, or generated files.
- `@repo/commerce/package.json` contains no Commercetools, gql.tada, URQL, or `@repo/commerce-commercetools` dependency.
- Add a focused repository boundary check that fails on forbidden provider dependency declarations or import specifiers in `@repo/commerce`, and run it with the package's typecheck/tests in CI.
- Application imports of `@repo/commerce-commercetools` are allow-listed to composition and provider-tooling roots; ordinary application modules importing it fail the same boundary check.
