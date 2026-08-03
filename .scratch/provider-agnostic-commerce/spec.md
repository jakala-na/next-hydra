# Provider-Agnostic Commerce

Status: ready for implementation

## Goal

Separate the current commerce package into a provider-neutral commerce domain package and a Commercetools implementation package without changing storefront behavior.

- `@repo/commerce` owns commerce models, Effect Services, policies, orchestration, request-boundary behavior, and reusable Cart, Checkout, Product, and Commerce Context integration.
- `@repo/commerce-commercetools` owns every Commercetools Layer and implementation detail.
- Applications select and compose the installed provider Layers only at composition roots.
- Replacing the Commercetools Layers must not require rewriting commerce pages, components, actions, use cases, or domain models.

The split is complete only when `@repo/commerce` has no provider dependency or provider-shaped source left. Moving files without deepening the Service boundaries does not satisfy the goal.

## Package ownership

### `@repo/commerce`

Core owns:

- provider-neutral Effect Schemas, branded identities, tagged operation failures, and Service contracts;
- Store configuration and locale/default-Store selection;
- Commerce Context, Current Cart, Checkout Session, Cart Policies, and Checkout Policies orchestration;
- Product Card, Product Detail, Product Variant, Product Attribute, Money, Price, Availability, Option, Category, and image models;
- actual Cart and Checkout Server Actions, Product and Buying Context server integration, metadata and JSON-LD projection, localization, revalidation, and design-system translation;
- provider-neutral action and HTTP contracts; and
- Service test Layers plus provider-neutral fixtures under `testing/` when a dedicated folder helps.

Core must not depend on, import, or re-export:

- `@repo/commerce-commercetools` or the selected auth package;
- Commercetools SDKs, URQL, Wonka, gql.tada, provider GraphQL types or documents;
- provider clients, credentials, predicates, Product Selections, price or inventory channel IDs;
- numeric resource versions, optimistic-concurrency mechanics, Custom Fields, Custom Types, raw provider schemas, migrations, or provider CLI code.

### `@repo/commerce-commercetools`

The provider package owns:

- REST and GraphQL clients, OAuth and retry configuration, Effect Config, and eager T3 Env key schemas;
- Carts, Commerce Accounts, Address Book, Product Discovery, Versioned Store, and Registration Queries implementations;
- Store-resource, Product Selection, distribution-channel, supply-channel, customer-group price, inventory, and provider membership resolution;
- provider queries, mutations, response decoding, domain mapping, resource versions, retries, update actions, and error inspection;
- provider Product Type and Custom Type schema assets, generated provider declarations, migrations, and CLI commands; and
- provider unit, integration, live, mapper, schema-generation, and migration tests.

It imports the packages that own the Services it implements: `@repo/commerce`, `@repo/registration`, and `@repo/versioned-store`. Those packages never import it.

## Module layout

Keep both commerce packages organized by capability rather than by technical tier.

```text
packages/commerce/
  cart/
  checkout/
  commerce-context/
  commerce-accounts/
  address-book/
  product/
  payment/
  registration/
  testing/
  layers.ts

packages/commerce-commercetools/
  cart/
  commerce-accounts/
  address-book/
  product/
  registration/
  versioned-store/
  config/
  schema/
  migrations/
  cli/
```

Do not create a `next/` folder or use `next-` filename prefixes. Next is the starter kit's only application host, so those names add no information. Introduce a framework namespace later only if a second real host creates an ambiguity.

## Domain context

`CommerceContext` is the single request-scoped context shared by Product Discovery, Current Cart, Checkout Session, Address Book, and Buying Context integration.

```ts
type Store = {
  readonly storeKey: StoreKey
  readonly locale: CommerceLocale
  readonly currency: CurrencyCode
}

type CommerceContext = {
  readonly store: Store
  readonly principal: CommercePrincipal
}
```

The request boundary resolves it in two steps:

```text
locale + optional selected StoreKey
  -> core Store configuration
  -> Store

Store + request CommerceIdentity + optional selected BusinessUnitId
  -> CommerceAccounts membership verification when authenticated
  -> CommerceContext
```

Store Key, Customer ID, and Business Unit ID are stable domain identities. Provider Store resources, channel IDs, membership queries, versions, and selection mechanics remain implementation details.

For authenticated customers, an explicitly selected Business Unit is accepted only when membership is verified. Otherwise the deterministic first verified Business Unit becomes the buying context. The selection cookie stores the Business Unit ID; the switcher displays its label. A buyer with no verified membership fails with `noBuyingContext`. Switching Store or Business Unit may legitimately reveal another Cart, another Checkout, or no active Cart.

For anonymous customers, the existing Cart cookie name, decoding, options, write, and clear behavior are preserved in the shared commerce request boundary. Cookie access is a boundary concern; Cart IDs are not expected to be resolved by callers before they invoke Current Cart.

## Service graph

Provider capability Services remain small and pure; core orchestration carries request context and policy.

```text
CommerceIdentity + CommerceAccounts
  -> CommerceContext

CommerceContext + Carts + CartPolicies
  -> CurrentCart

CommerceContext
  -> ProductDiscovery
  -> AddressBook

CommerceContext + CurrentCart + AddressBook + CheckoutPolicies
  -> CheckoutSession
```

- `Carts` is the provider capability for arbitrary Cart persistence and retrieval. It does not become context scoped.
- `CurrentCart` owns current-user Cart selection, anonymous association, buying-context orchestration, and Cart mutations. Provider resource versions remain inside `Carts`.
- `CommerceAccounts` is the provider capability for Customers, Business Units, membership, hierarchy, roles, Store membership, and provisioning data. Commerce Context owns the request-specific decision about which buying context is active.
- `AddressBook` consumes Commerce Context rather than receiving Customer or Business Unit identifiers from every caller.
- `CartPolicies` and `CheckoutPolicies` remain independent core Services used by Current Cart and Checkout Session.
- `CheckoutSession` owns Checkout state and mutations; callers do not provide Checkout Scope, Current Cart, Address Book, or provider Layers manually.

Services expose cohesive method bags. Do not add standalone use-case Effects that float outside a Service and require callers to assemble their dependencies. Concrete Server Actions and Server Components may define their boundary Effect, provide the complete request Layer once, and call `Effect.runPromise` once.

## Product domain

Product is the catalog concept; Product Variant is the purchasable unit. Product Card and Product Detail are schema-backed commerce read models rather than UI props or provider DTOs.

```ts
type ProductCard = {
  readonly id: ProductId
  readonly slug: ProductSlug
  readonly title: NonEmptyString
  readonly description?: string
  readonly featuredImage?: ProductImage
  readonly startingPrice?: Money
  readonly availableForSale: boolean
}

type ProductDetail<TKey extends ProductTypeKey = ProductTypeKey> = {
  readonly id: ProductId
  readonly slug: ProductSlug
  readonly productType: TKey
  readonly title: NonEmptyString
  readonly description?: string
  readonly categories: ReadonlyArray<ProductCategory>
  readonly options: ReadonlyArray<ProductOption>
  readonly variants: NonEmptyReadonlyArray<ProductVariant<TKey>>
  readonly defaultVariantId: VariantId
}

type ProductVariant<TKey extends ProductTypeKey> = {
  readonly id: VariantId
  readonly sku?: Sku
  readonly images: ReadonlyArray<ProductImage>
  readonly attributes: ProductAttributesByProductType[TKey]
  readonly optionValues: Readonly<Record<ProductOptionKey, ProductOptionValueKey>>
  readonly price?: ProductPrice
  readonly availability: ProductAvailability
}

type ProductPrice = {
  readonly regular: Money
  readonly discounted?: Money
}

type ProductAvailability = {
  readonly availableForSale: boolean
  readonly availableQuantity?: NonNegativeInt
}
```

Rules:

- Product-level and Variant-level provider attributes become one effective typed Attribute object on the purchasable Variant.
- Generated Effect Schemas in core preserve Product-Type-specific TypeScript autocomplete and runtime validation.
- The provider generator may write the committed provider-neutral Attribute artifact into core. The generated artifact may import only Effect and core commerce modules.
- Product Price is already resolved for Store and buyer segment. Customer-group selection does not appear as another public price bucket.
- Product Availability is already resolved for Commerce Context.
- `defaultVariantId` must name a Variant in the non-empty collection.
- Provider resource versions, raw attributes, fragments, channel records, Product Selection rules, and fabricated generic fields bags do not appear in these models.

## Product Discovery

Core exposes one `ProductDiscovery` Service:

```ts
class ProductDiscovery extends Context.Service<
  ProductDiscovery,
  {
    readonly findBySlug: (
      slug: ProductSlug
    ) => Effect.Effect<Option.Option<ProductDetail>, ProductDiscoveryFailure>

    readonly listCards: (input: {
      readonly categoryId?: CategoryId
      readonly limit: PositiveInt
      readonly excludeProductId?: ProductId
    }) => Effect.Effect<ReadonlyArray<ProductCard>, ProductDiscoveryFailure>
  }
>()("@repo/commerce/ProductDiscovery") {}
```

`ProductDiscoveryFailure` is one operation-scoped tagged failure with diagnostic cause data. Normal exact absence is `Option.none`.

`listCards` returns at most `limit` Store-eligible cards ordered by localized title ascending. It has no raw filter, generic search, caller-selected sort, offset, cursor, facets, or total count. A later browse/search use case gets a separate contract when its UI requirements exist.

The Commercetools Layer privately resolves Store resources, Product Selections, the current pricing channel, all inventory channels, buyer pricing membership, structured provider predicates, contextual price and availability, and generated Attribute decoding. A malformed exact Product Detail fails the operation. A malformed collection card is logged and omitted.

`ProductDiscovery.testLayer` is co-located with the Service and accepts deterministic handlers or seeded results. Core tests never import provider fixtures.

## Web composition and reusable boundaries

Core owns a server-only `@repo/commerce/layers` module with the named Layer contract and unconfigured Layers that fail with `CommerceLayersNotConfigured`. Package-owned boundaries import that exact bare specifier.

`apps/web/next.config.ts` binds it at compile time:

```text
@repo/commerce/layers
  -> exact Turbopack resolveAlias
  -> apps/web/lib/commerce-layers.ts
```

The app-owned module imports the selected provider's immutable, unbuilt capability Layers and supplies the WorkOS-backed `CommerceIdentity` Layer. It exports named Layers because their dependency timing differs; it is not a runtime, registry, request container, or action facade.

Each package-owned boundary combines those Layers with a fresh request Layer and core orchestration, provides the graph once, executes its Service method, and closes the request scope. Do not use `instrumentation.ts`, `globalThis`, `GlobalValue`, a mutable registry, a process `ManagedRuntime`, or a generic `runCommerceProgram(effect)` abstraction.

The verified Next.js `16.1.6` prototype proved:

- exact alias substitution for an import originating inside the JIT core package;
- package-owned Server Component rendering through the app-selected Layers;
- package-owned module-level `"use server"` action registration in the production server-reference manifest;
- standalone core typechecking with the unconfigured module; and
- explicit missing-binding failure.

Non-Next tests do not inherit the Next alias. Tests of ordinary Services provide test Layers directly. A test specifically exercising the application binding configures the same exact alias.

## Cart, Checkout, Product, and Buying Context integration

### Cart

`@repo/commerce/cart` owns the real add, quantity-change, and remove Server Actions, their client contracts and failure mapping, and the Server Component that loads Current Cart and supplies the design-system Cart provider. The app layout chooses placement only. It does not load Cart state, build Layers, or pass an actions bag.

### Checkout

`@repo/commerce/checkout` owns the Checkout page Server Component, Checkout and Address Book loading, address-option projection, `notFound`, real contact and delivery Server Actions, FormData decoding, diagnostics, localization, revalidation, and design-system projection. The app route validates locale, calls `setRequestLocale`, and delegates to the package page.

### Product

`@repo/commerce/product` owns Product Collection, Product Detail, metadata, JSON-LD, `notFound`, localization inputs, and design-system projection. CMS decodes its own content and passes a domain Category ID plus presentation content to commerce. App Product routes retain only route-parameter and locale handling.

Resolved Product results are buyer-contextual and are not stored in a locale-only or Store-only `"use cache"`. Request-local Layer memoization is allowed. A Product-specific React `cache` loader may deduplicate metadata and page reads within one request only after that behavior is proven.

### Buying Context

The Business Unit switcher and its action live beside Commerce Context. They reuse the already-resolved Customer, Store, and Buying Context; `CommerceAccounts` is used only to list verified choices. The action stores Business Unit ID, the UI displays Business Unit Label, and switching refreshes the current server route even during Checkout.

The application owns route files, locale validation, layout slots, provider/auth Layer selection, and the exact alias. It does not repeat package-owned actions as facades.

## Provider exports and configuration

`@repo/commerce-commercetools` has explicit exports and no broad root barrel:

| Export | Supported surface |
| --- | --- |
| `./provider` | named Carts, Commerce Accounts, Address Book, and Product Discovery Layers for Web |
| `./cart` | `cartsLayer` |
| `./commerce-accounts` | `commerceAccountsLayer` |
| `./address-book` | `addressBookLayer` |
| `./product` | `productDiscoveryLayer` |
| `./versioned-store` | `versionedKeyValueStoreLayer({ container })` |
| `./registration` | `registrationQueriesLayer({ container })` |
| `./config` | `CommercetoolsConfig` and production/test Layers |
| `./keys` | server-only T3 Env key schema |
| `./cli` | provider command factory |

Raw clients, documents, generated declarations, persistence types, retry helpers, Custom Field helpers, migrations, raw schema assets, and test factories are private.

`CommercetoolsConfig.layer` reads non-empty `COMMERCETOOLS_*` variables through Effect Config and redacts the client secret. Web, API, and CLI also import the provider's T3 Env server-key schema so invalid configuration fails at process startup rather than on first endpoint use. Remove unused `NEXT_PUBLIC_COMMERCETOOLS_*` configuration.

Capability Layers close over one shared `commercetoolsClientsLayer` constant. Effect memoizes that Layer by reference when capabilities are composed in one graph. Request Commerce Context remains fresh; no raw process singleton is exposed to callers.

## Application composition

Web declares both `@repo/commerce` and `@repo/commerce-commercetools` directly. Its only normal provider import is the Layer-selection module, plus its environment root.

API composes provider capability Layers explicitly for Checkout and Registration runtimes. CLI imports the provider CLI and key modules directly. Neither API nor CLI goes through the Web alias or imports raw provider clients and queries.

## Migration sequence

Each step is a separate green, reviewable commit.

1. Record the completed JIT Layer-binding proof.
2. Create the provider compatibility package with explicit per-capability provider-to-core re-exports; add direct Web/API/CLI dependencies.
3. Switch Web/API/CLI composition and environment imports once; add the Web Layer module and exact alias.
4. Remove public Commercetools environment variables while retaining eager server validation.
5. Add provider-neutral Product Schemas and invariant tests to core.
6. Add Product Discovery, its input/error Schemas, `Option` absence, test Layer, and core tests.
7. Replace provider-shaped Store context with core Store configuration and Commerce Context inputs.
8. Implement the Commercetools Product Discovery Layer and provider tests.
9. Move Product React callers to Product Discovery and remove raw Product/Store choreography and unsafe caching.
10. Centralize the Web commerce request boundary, Commerce Identity, core binding module, and app-selected Layers.
11. Move the complete Cart integration slice and actual actions into core.
12. Move the complete Checkout integration slice and actual actions into core.
13. Move Buying Context UI and mutation into core.
14. Establish provider-local Effect Config, REST/GraphQL clients, generated declarations, and shared client Layers.
15. Move Carts with versions, conflict retry, actions, fields, decoders, and tests.
16. Move Commerce Accounts with Customer, Business Unit, role, hierarchy, Store-membership, provisioning, and tests.
17. Move Address Book with address keys, Business Unit mutations, versions, mappings, and tests.
18. Move the Commercetools Versioned Store implementation and conflict tests.
19. Move Registration Queries from API into the provider package and preserve filtering and keyset pagination.
20. Move provider schemas, generation, migrations, CLI code, dependencies, tests, and documentation.
21. Delete all duplicate provider infrastructure and temporary compatibility re-exports from core.
22. Add explicit final exports, provider-import allowlists, generated-artifact purity checks, dependency/import boundary checks, split docs, and full validation.

The only temporary bridge allowed during migration is an explicit `@repo/commerce-commercetools` capability export that re-exports the existing implementation from `@repo/commerce`. Core never imports or aliases provider source.

## Acceptance criteria

- Existing Cart, Checkout, Buying Context, Product Catalog, localized ordering, price, availability, Registration, Versioned Store, and CLI behavior is preserved.
- Core package tests and typechecking run without provider imports or configuration.
- Provider tests exercise each Layer through its owning Service contract.
- Web contains package-owned Cart and Checkout actions and Product/CMS Server Components through the exact Layer alias.
- Switching Store or Business Unit refreshes server state and never displays a stale Cart or Checkout.
- Resolved Product data is not shared across incompatible buyer contexts.
- `@repo/commerce/package.json` contains no provider, GraphQL-client, provider-tooling, or provider-package dependency.
- Core source and generated Product Attribute output contain no provider imports or provider mechanics.
- Application provider imports are restricted to approved composition, environment, and tooling roots.
- The compatibility shell and all old provider files are deleted.

The detailed evidence and rationale remain in [the Wayfinder map](map.md) and its resolved child tickets. The exact commit-level composition and boundary checks are recorded in [Provider composition and package extraction sequence](issues/08-provider-composition-and-package-extraction-sequence.md); the build proof is recorded in [Prove the Next provider module binding](issues/10-prove-next-provider-module-binding.md).
