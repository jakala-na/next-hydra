# Non-catalog provider capabilities and tooling

Type: grilling
Status: resolved
Blocked by: 01, 02

## Question

Decide the destination and public surface for every remaining provider-specific cluster outside Product Discovery.

Cover Commercetools REST and GraphQL clients, OAuth/environment configuration, generated GraphQL schema and cache files, custom-field and product-type generation, provider schema JSON, provider migrations, Commerce CLI commands, versioned custom-object storage, Registration query implementations, existing Cart/Account/Address Book Layers, and provider-focused tests. For each cluster, decide whether it moves intact into `@repo/commerce-commercetools`, is replaced by a provider-neutral Service in `@repo/commerce`, stays at an application composition root, or belongs to another existing package.

Keep generic storage contracts such as `VersionedKeyValueStore` independent from their Commercetools Layers, and prevent provider tooling from forcing Commercetools dependencies into the core package.

## Confirmed decisions

- Move the existing Commerce CLI implementation with the Commercetools tooling, but do not make its external command-group name part of this extraction. The provider package may continue to claim the `commerce` namespace. A future rewrite to Effect CLI will decide whether that namespace remains `commerce` or becomes `commercetools`.
- Provider runtime Layers consume a `CommercetoolsConfig` Effect Service whose production Layer reads and validates the Commercetools environment variables with Effect Config; non-secret values use non-empty schemas and the client secret uses a redacted non-empty schema. Invalid config prevents the provider Layers from being constructed.
- Retain the Commercetools T3 Env key module in `@repo/commerce-commercetools` and continue extending it from the Web, API, and CLI environment roots so `next dev` and other application startup paths fail eagerly without waiting for a commerce operation. Effect Config and T3 Env intentionally validate the same environment contract at different boundaries. Do not introduce a T3-Env-backed Effect Layer in this extraction; it may replace the direct Effect Config source later.
- REST and GraphQL clients, OAuth middleware, retry policy, URQL exchanges, and generated GraphQL types remain private provider infrastructure. Capability Layers receive configuration through Effect context rather than accepting raw clients from application callers.
- Raw Commercetools Product Type and Custom Type schema exports, the schema exporter, and type-generator implementation live in `@repo/commerce-commercetools`. Generated Custom Type helpers remain provider-private; do not introduce a provider-neutral custom-fields model or builder in core.
- The Commercetools generator intentionally writes the committed, provider-neutral Product Attribute Effect Schemas into a predictable generated location in `@repo/commerce`. Only one commerce provider is registered for generation at a time, so this generation-time write is acceptable and does not create a runtime core-to-provider dependency. The generated artifact contains no Commercetools imports, raw schema shapes, or provider field-kind vocabulary and is typechecked with core commerce.
- Remove `NEXT_PUBLIC_COMMERCETOOLS_PROJECT_KEY` and `NEXT_PUBLIC_COMMERCETOOLS_REGION` from T3 Env, live-test mocks, examples, and documentation. They have no runtime consumer, all provider access is server-side, and keeping duplicate public project/region settings permits configuration drift.

## Answer

### Provider infrastructure and configuration

`@repo/commerce-commercetools` owns the complete provider infrastructure cluster:

- the Commercetools SDK client, API root, OAuth middleware, retry configuration, region-derived endpoints, and scopes;
- the URQL client, Commercetools exchange, GraphQL error logging, and client memoization;
- `gql.tada` setup, synchronized GraphQL schema, generated cache/environment declarations, synchronization script, TypeScript plugin configuration, and all direct Commercetools, URQL, Wonka, and gql.tada dependencies;
- the T3 Env Commercetools key module used by application environment roots for eager validation; and
- the provider-specific `CommercetoolsConfig` Effect Service used by provider Layers.

`CommercetoolsConfig.layer` reads the server-side `COMMERCETOOLS_*` variables through Effect Config. Project key, client ID, scope, and region are non-empty; client secret is redacted and non-empty. A configuration failure prevents REST/GraphQL client Layers and all dependent capabilities from being constructed. Web, API, and CLI environment roots also extend the provider package's T3 Env schema so local development and application startup fail eagerly. This deliberate duplicate validation serves two boundaries; a future T3-Env-backed Layer may unify the source, but this extraction does not invent it.

Remove `NEXT_PUBLIC_COMMERCETOOLS_PROJECT_KEY` and `NEXT_PUBLIC_COMMERCETOOLS_REGION`; there are no browser consumers and provider access remains server-side.

Raw REST and GraphQL clients are private implementation Services/Layers. Application routes, actions, and domain programs cannot import them or pass them to commerce methods. Exported capability Layers close over the internal client Layers and receive only their legitimate Effect dependencies and provider configuration. Ticket 08 decides the exact composition helpers and ensures a shared Layer instance is memoized rather than constructing duplicate clients.

### Existing commerce capability Layers

Move the following implementations and their provider helpers into capability modules in `@repo/commerce-commercetools` without changing their provider-neutral Service contracts:

- `cart/` provides `Carts`; it owns provider Cart persistence shapes, numeric resource versions, optimistic-concurrency retry, GraphQL Cart queries/mutations, update-action builders, Custom Type/Custom Field encoding, Store resource lookup, and provider Product/Price decoding used for Cart Snapshots.
- `commerce-accounts/` provides `CommerceAccounts`; it owns Customer, Business Unit, associate-role, hierarchy, and Store query mechanics while returning only the existing commerce-account models and failures.
- `address-book/` provides `AddressBook`; it owns Commercetools address keys, Business Unit address mutations, provider versions, and update actions.

`CurrentCart`, `CommerceContext`, `CartPolicies`, `CheckoutPolicies`, and `CheckoutSession` remain core orchestration. There is no provider `current-cart/` or `checkout/` module merely to mirror core. Provider failures and concurrency details are mapped to errors owned by the implemented Service; raw SDK/GraphQL errors and provider resource versions never cross the Layer.

Public capability modules export the production Commercetools Layer constructors required by application composition. Test-only constructors that accept fake provider implementations or raw API roots remain internal to provider tests rather than becoming supported package APIs.

### Versioned storage and Registration queries

`VersionedKeyValueStore`, its schemas/errors, JSON codec, and memory Layer remain wholly owned by `@repo/versioned-store`. The `versioned-store/` module in `@repo/commerce-commercetools` exports the Custom Object Layer implementing that Service and privately owns Custom Object versions, predicates, pagination, conflict inspection, and encoding mechanics. Its Custom Object container is a provider implementation option supplied only at the composition root.

`RegistrationQueries` and Registration policy remain owned by `@repo/registration`. The current Commercetools implementation moves from `apps/api` to the provider package's `registration/` module and exports a Layer implementing `RegistrationQueries`. It owns Custom Object predicates, provider paging, cursor translation, storage-shape compatibility decoding, and provider batch limits while returning only Registration-owned records and failures. The API application retains final composition and supplies the configured container; the provider package does not acquire Registration lifecycle policy.

Keeping the query Layer separate from the generic Versioned Key-Value Store is intentional. Registration listing requires provider-side filtering, stable pagination, timestamps, and query behavior that the generic storage contract does not promise; widening `VersionedKeyValueStore` to model Commercetools query mechanics would weaken both modules.

### Schema generation and Custom Fields

The provider package owns raw schema assets and the machinery that understands them:

```text
@repo/commerce-commercetools
  schema/product-types/*.json
  schema/types/*.json
  custom-fields/generated/*
  tooling/typegen/*
```

Raw Custom Type schemas, generated Custom Field kinds/types/resolvers, `setCustomType` and `setCustomField` action construction, and Custom Type migrations remain provider-private. Existing Cart/Order fields are promoted into explicit core domain values where required; core does not expose an arbitrary fields bag or generic Custom Fields builder.

The Commercetools generator intentionally writes one committed public artifact into a predictable generated location in `@repo/commerce`: the provider-neutral Product Type Attribute Effect Schemas decided in ticket 03. Only one commerce provider is registered for generation at a time. Generation may therefore replace that artifact without creating a runtime dependency. The artifact imports only Effect and core commerce types, contains no Commercetools vocabulary, and is typechecked with core. Provider tests verify translation from raw Product Types and reject provider imports or shapes in generated core output.

### Migrations and CLI

Move the migration framework, migration client, applied-migration Custom Object tracking, migration scripts/tests, schema export commands, provider schema assets, type generators, and related Commander/chalk/ora/dotenv dependencies into `@repo/commerce-commercetools`.

`apps/cli` remains the command composition root and imports the provider package's CLI module directly. `@repo/commerce` contains no provider administration command or umbrella CLI facade. The extraction does not rename the external `commerce` command group: the provider package may continue claiming it, and a future Effect CLI rewrite decides the final command hierarchy.

CLI `.env` loading still occurs before its Effect program runs. The provider configuration Layer then performs the same typed validation used by server runtimes.

### Tests and documentation

- Commercetools Layer unit tests, integration/live tests, provider persistence fixtures, GraphQL mapper tests, migration tests, schema/type-generation tests, and Registration provider tests move beside their provider modules.
- Core commerce keeps domain-schema, policy, orchestration, memory/test-Layer, HTTP/action-contract, and provider-neutral component tests.
- `@repo/versioned-store` and `@repo/registration` retain their Service contract and memory-Layer tests; they do not import the provider package to run production-provider tests.
- Application tests cover only application-owned environment and Layer composition behavior.
- Split documentation into provider-neutral commerce usage in `@repo/commerce` and Commercetools credentials, schema generation, migrations, CLI operations, and live-test setup in `@repo/commerce-commercetools`.

### Resulting supported provider-package surface

The provider package exposes only:

- its T3 Env key schema and `CommercetoolsConfig` Layer at provider-configuration roots;
- one explicit production Layer module for each implemented Service: Product Discovery, Carts, Commerce Accounts, Address Book, Versioned Key-Value Store, and Registration Queries; and
- its CLI command factory at the CLI composition root.

Raw clients, GraphQL documents, SDK types, provider persistence shapes, Custom Field helpers, generated provider types, schema loaders, migrations, and test factories are not supported runtime imports. Explicit package exports and the repository boundary check prevent deep imports.
