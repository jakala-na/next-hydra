# Remaining provider leakage and dependency graph

## Summary

`CurrentCart`, `Carts`, `CommerceContext`, `CommerceAccounts`, `AddressBook`, and `CheckoutSession` now expose provider-agnostic domain values and Effect programs. That is a real Service seam, but it is not yet a provider-agnostic package: `@repo/commerce` still owns the Commercetools Layers, provider clients, GraphQL schema, provider configuration, provider persistence shapes, generators, migrations, and CLI.

Product Catalog and Discovery is the largest remaining runtime seam that is both provider-shaped and shallow. The current two caller-facing operations are implemented by a Promise singleton that coordinates Store lookup, channel selection, Commercetools Product Projection Search, Product Selection filtering, provider fragment decoding, and UI DTO mapping. Product Catalog/Discovery is therefore the strongest next behavior slice, provided Store catalog resolution is included rather than passed through as channel IDs.

The physical two-package split should remain last. Existing Commercetools code imports provider-neutral domain and Service modules, but also imports legacy provider shapes and helpers scattered through `lib/product`, `lib/store`, `lib/cart`, `lib/custom-fields`, and `lib/types.ts`. Moving directories first would either create a dependency cycle or cause `@repo/commerce` to retain provider dependencies under less obvious names.

## Current dependency graph

```text
CMS blocks / Next pages / Web actions / API runtimes
  |
  +--> @repo/commerce React and action integration
  |      |
  |      +--> productService / storeService Promise singletons
  |             |
  |             +--> productRepo / storeRepo
  |                    |
  |                    +--> gql.tada fragments + URQL client
  |                           |
  |                           +--> Commercetools SDK client + OAuth config
  |
  +--> provider-neutral Effect Services
         CurrentCart / Carts / CommerceContext / CommerceAccounts /
         AddressBook / CheckoutSession
           |
           +--> Commercetools Layers still inside @repo/commerce
                  |
                  +--> SDK and GraphQL clients
                  +--> legacy Cart / Store / product mapper shapes
                  +--> Custom Type actions and version retry mechanics

API Registration runtime
  |
  +--> provider-neutral Registration Services and VersionedKeyValueStore
  +--> Commercetools RegistrationQueries implementation in apps/api
  +--> Commercetools Custom Object Layer in @repo/commerce
```

The desired dependency direction is:

```text
applications and reusable integration
            |
            v
     @repo/commerce
domain schemas + Effect Services + provider-independent orchestration
            ^
            |
@repo/commerce-commercetools
provider Layers + clients + decoding + tooling

application composition roots import both packages only to select Layers
```

`@repo/commerce` must never import `@repo/commerce-commercetools`. The provider package necessarily imports the core package to implement its Services and construct its domain models.

## Dependency clusters

### 1. Product Catalog and Discovery

The current caller-facing singleton exposes `getProductBySlug` and `getProductsCollection`, then coordinates the entire provider workflow in [`product.service.ts`](../../../packages/commerce/lib/product/product.service.ts). It resolves a Store, passes distribution and supply channel IDs into [`product.repo.ts`](../../../packages/commerce/lib/product/product.repo.ts), issues Commercetools Product Projection Search queries, separately loads Store Product Selection assignments, filters variants, and maps fragments into DTOs.

Provider mechanics currently crossing or shaping the seam include:

- a raw Commercetools `filter` string supplied by [`product-collection.tsx`](../../../packages/commerce/components/blocks/product-collection.tsx);
- Product Projection Search, locale-embedded sort expressions, and GraphQL fragments;
- distribution-channel IDs for scoped price selection and supply-channel IDs for availability;
- Store Product Selection assignment modes and SKU inclusion/exclusion rules;
- Commercetools attribute kinds such as localized enum/text encodings;
- provider-shaped Price, Availability, Channel, Store, Product Selection, and numeric Variant representations in [`lib/types.ts`](../../../packages/commerce/lib/types.ts);
- fragment-aware mappers under [`lib/product/mappers`](../../../packages/commerce/lib/product/mappers).

The future core package should own schema-backed Product, purchasable Variant, effective Attributes, Price/Money, Availability, Product Summary, Product Details, Category, image, and SEO values plus the Product Discovery Service. The Commercetools package should own the queries, fragments, raw attribute decoding, channel use, Product Selection interpretation, provider sorting, and translation into those core values.

Important extraction constraint: the Commercetools Cart implementation also imports product attribute and price mappers from `lib/product`. Those shared provider decoders must move into the provider package or be separated into provider-private Cart and Catalog projections before `@repo/commerce` can drop GraphQL types.

### 2. Store, market, and catalog resolution

[`store.service.ts`](../../../packages/commerce/lib/store/store.service.ts) and [`store.repo.ts`](../../../packages/commerce/lib/store/store.repo.ts) currently mix universal Store selection with Commercetools mechanics. The public `StoreContext` exposes Store ID, first distribution channel key/ID, and all supply-channel IDs. Its callers include Product Discovery, `inStoreAction`, the Web Current Cart boundary, the Business Unit switcher, and the Commercetools Carts Layer.

The domain-accepted facts already exist in `CartStore` and `CommerceContext`: locale, Store key, and currency. Store key is not leakage merely because Commercetools uses one. Channel IDs and Product Selection assignments are provider mechanics because callers need only their outcomes: effective price, availability, and sellable variants.

The future design must decide how a selected Store reaches Product Discovery and how a future Store selector works. Regardless of that choice, the Commercetools Product Discovery and Carts Layers should resolve their own channel/reference mechanics from provider-neutral Store facts. The anonymous Cart cookie should stop importing the oversized provider-shaped `StoreContext`; it uses only locale, currency, and Store key.

### 3. Existing Effect Services and Commercetools Layers

The Service contracts in [`packages/commerce/services`](../../../packages/commerce/services) are the provider-neutral core. Their Commercetools implementations under [`lib/infra/commercetools`](../../../packages/commerce/lib/infra/commercetools) are future provider-package code:

- `layerCommercetoolsCarts` and its persistence implementation;
- `layerCommercetoolsCommerceAccounts`;
- `layerCommercetoolsAddressBook`;
- the Commercetools versioned Custom Object Layer;
- provider error and concurrent-version decoding.

The Cart Layer still depends on a legacy `Cart` shape containing numeric version, provider Store/custom-field structure, and Commercetools line-item representations. Its update action builders live outside the provider directory under `lib/cart`, while product/price decoding lives under `lib/product`. Those are physical ownership leaks, not evidence that the new `Carts` or `CurrentCart` Service contracts should change.

Application runtimes correctly remain composition roots, but their imports should eventually select Layers from `@repo/commerce-commercetools` rather than deep provider paths inside `@repo/commerce`. Current examples are [`apps/api/lib/checkout/runtime.ts`](../../../apps/api/lib/checkout/runtime.ts) and [`apps/web/lib/current-cart.ts`](../../../apps/web/lib/current-cart.ts).

### 4. Provider clients, configuration, and GraphQL generation

The following cluster is entirely Commercetools-specific and should move together:

- SDK API root, OAuth middleware, and retry configuration in [`api-root.ts`](../../../packages/commerce/lib/client/api-root.ts);
- the Commercetools URQL exchange and GraphQL client;
- environment schemas in [`keys.ts`](../../../packages/commerce/keys.ts);
- `gql.tada` initialization and generated GraphQL schema/cache artifacts;
- GraphQL schema synchronization in [`scripts/gql-sync.ts`](../../../packages/commerce/scripts/gql-sync.ts);
- provider-specific TypeScript plugin configuration in the package `tsconfig`;
- direct `@commercetools/*`, `gql.tada`, URQL, and Wonka dependencies.

Core cannot be considered provider-agnostic while these dependencies remain in its package manifest, even if ordinary callers never import them. The eventual acceptance check is both source-level and manifest-level: no Commercetools imports, environment variables, generated provider schema, or provider packages in `@repo/commerce`.

### 5. Custom fields, product types, schema tooling, migrations, and CLI

The current package owns two related but different concerns:

- Commercetools Custom Type/Custom Field encoding used by Cart and Order persistence;
- project-defined Product attribute schemas currently generated from Commercetools product-type JSON.

Custom Type keys, raw custom-field arrays, `setCustomType`/`setCustomField` action construction, provider version conflicts, and provider schema JSON belong in `@repo/commerce-commercetools`. Core should retain only named domain fields already promoted into Cart, Checkout, Product, or other domain models.

Effective Product Attributes are provider-agnostic domain data, but the source product-type schema and generated Commercetools attribute decoding are provider concerns. The Product model decision must establish the core Attribute values before deciding whether generation emits a core schema artifact, a provider decoder, or both.

The Commerce CLI, schema/type commands, migration client, migration scripts, and provider schema assets are currently packaged under `@repo/commerce`. They should become provider-package tooling consumed by `apps/cli`. A provider-neutral umbrella CLI command may remain only if it composes commands without importing provider SDKs into core.

### 6. Versioned storage and Registration provider queries

`VersionedKeyValueStore` already lives in [`@repo/versioned-store`](../../../packages/versioned-store) and is provider-neutral. Only [`layerCommercetoolsCustomObjectKeyValueStore`](../../../packages/commerce/lib/infra/commercetools/key-value-store.ts) belongs in the future provider package.

Registration exposes provider-neutral query and lifecycle Services, but its Commercetools Registration query implementation currently lives in [`apps/api/lib/registration/providers/commercetools-registration-queries.ts`](../../../apps/api/lib/registration/providers/commercetools-registration-queries.ts) and imports the Commerce package's SDK root. That implementation and its provider tests should move to `@repo/commerce-commercetools`; the API runtime should only compose it with Registration Services.

This move must not pull Registration domain policy into the commerce provider package. The provider Layer implements the existing Registration query/storage Service contracts defined by their owning packages.

### 7. React, Next.js, action contracts, and presentation translation

Checkout React components and action-state contracts already consume provider-neutral Checkout and Cart models. Product components do not: they call the Promise singleton directly and translate provider-shaped DTOs to design-system props.

React components are not inherently provider-specific. They may remain in core if they consume only core models/Services and return provider-independent presentation. Next-specific cookie/header access, `notFound`, metadata, cache directives, revalidation, localization lookup, and Server Action declaration are framework/request mechanics rather than Commercetools mechanics. Their exact package ownership is a separate decision because moving them into core can add a Next dependency without adding provider leakage.

Cart and Checkout Server Actions should never select provider Layers individually. Whether their reusable bodies live in `@repo/commerce` or applications, one request composition seam should provide the complete selected commerce Layer graph.

### 8. Application composition, environment modules, tests, and documentation

`apps/web` and `apps/api` currently import Commercetools Layers and `@repo/commerce/keys`; `apps/cli` imports Commerce CLI commands and server keys. These imports are legitimate only at composition/configuration entrypoints, but after the split they must target the provider package.

Provider implementation tests move with provider code. Core Service tests, memory Layers, domain-model tests, HTTP/action contracts, and reusable component tests stay in core. Contract suites should be owned by core and run against memory implementations plus each provider Layer without making core import the provider package in production source.

The current Commerce README and application configuration docs describe `@repo/commerce` as a Commercetools integration. They must be split into core usage and provider setup documentation when the package boundary changes.

## Ranked extraction candidates

1. **Product Catalog model plus Store context semantics.** Resolve the core Product projections and provider-neutral Store inputs first. This removes the vocabulary leaks that would otherwise infect the Service contract.
2. **Product Discovery Effect Service plus Commercetools Layer.** Replace the Promise singleton, raw filter input, Store repository choreography, fragments, Product Selection filtering, and DTO mappers as one behavior-preserving slice.
3. **Provider infrastructure consolidation.** Move the SDK/GraphQL clients, environment configuration, existing Cart/Account/Address Book Layers, legacy provider Cart persistence shapes, custom-field action builders, and shared provider decoders behind a single provider-package dependency direction.
4. **Provider tooling and schema assets.** Move GraphQL generation, product/custom-type schemas, type generation, migrations, and Commerce CLI commands after runtime dependencies no longer point back into their old locations.
5. **Registration provider implementations.** Move Commercetools Registration queries and Custom Object storage Layer while preserving Registration-owned Service contracts and domain policy.
6. **Application composition and physical package split.** Update Web/API/CLI runtime imports, manifests, environment aggregation, contract-test execution, and documentation; then prove `@repo/commerce` has no provider dependencies.

React/Next integration ownership is intentionally not ranked as a provider extraction: it can be decided alongside the Product caller migration, but it is a framework/package-depth decision rather than a Commercetools seam.

## Extraction-order constraints

- Do not create `@repo/commerce-commercetools` first and leave core-to-provider imports as a bridge. The dependency direction must be provider package to core only.
- Define core Product and Store values before moving product mappers; otherwise generated GraphQL fragments remain the de facto domain model.
- Replace the raw catalog filter string before moving Product Discovery; carrying it forward would expose the provider query language through a new Effect Service.
- Untangle the Commercetools Cart Layer from `storeService`, product mappers, `lib/types.ts`, and external custom-field builders before or during provider infrastructure consolidation.
- Move clients/configuration with the provider Layers that use them so no temporary provider client Service leaks into core.
- Move schema/typegen/migration/CLI assets only after their runtime output ownership is known, especially Product Attributes that cross from provider decoding into core models.
- Keep application composition roots operational throughout: each incremental commit must provide the same selected Layers and preserve current Store, Product Catalog, pricing, inventory, Cart, Checkout, and Registration behavior.
