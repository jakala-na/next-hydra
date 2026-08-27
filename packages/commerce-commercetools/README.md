# @repo/commerce-commercetools

The Commercetools implementation of the provider-neutral Services owned by `@repo/commerce`, plus Commercetools administration tooling.

Applications import only the package's explicit capability Layers, environment keys, or CLI command factory. REST and GraphQL clients, provider queries, resource versions, schema assets, migrations, and generators are private implementation details.

## Configuration

Copy `.env.example` into the application or command environment and provide all five server-only values:

```bash
COMMERCETOOLS_PROJECT_KEY=your-project-key
COMMERCETOOLS_CLIENT_ID=your-client-id
COMMERCETOOLS_CLIENT_SECRET=your-client-secret
COMMERCETOOLS_SCOPE=manage_project:your-project-key
COMMERCETOOLS_REGION=us-central1.gcp
```

Application T3 Env roots extend `@repo/commerce-commercetools/keys` for eager startup validation. Provider Layers use `CommercetoolsConfig.layer` to validate the same contract when their Effect graph is constructed.

Web and API import their application environment from `next.config.ts`, so the T3 Env contract is evaluated during `next dev` and `next build` rather than on the first commerce request. The CLI validates the same contract after loading its command environment.

## Supported exports

- `provider` selects the named Web capability Layers.
- `cart`, `commerce-accounts`, `address-book`, and `product` provide individual commerce capability Layers.
- `versioned-store` and `registration` provide application composition Layers.
- `config` and `keys` expose the provider configuration contracts.
- `cli` exposes the `commerce` administration command factory.

Raw clients, schemas, migrations, and generators are intentionally not package exports.

## Schema and migration tooling

Run the commands through the workspace CLI:

```bash
pnpm cli --env-file apps/cli/.env.bootstrap.local commerce project provision --output apps/cli/.env.runtime.local
pnpm cli --env-file apps/cli/.env.runtime.local commerce project seed
pnpm cli commerce schema export
pnpm cli commerce types generate
pnpm cli commerce migrate plan
pnpm cli commerce migrate
```

Project provisioning reads a manually-created bootstrap API Client from the standard `CTP_*` variables, including its auth/API URLs and scopes. It creates the versioned application runtime scopes, applies pending migrations, and publishes a new dotenv file using the application's existing `COMMERCETOOLS_*` variables, exclusive creation, and `0600` permissions. The bootstrap client is deleted only after the runtime credentials have been verified from disk. Existing output files are never overwritten.

Schema export writes raw Product Types and Custom Types under `schema/`. Type generation writes provider-private Custom Field helpers under `custom-fields/` and intentionally regenerates the provider-neutral Product Attribute Effect Schemas at `packages/commerce/product/generated/attributes.ts`.

Migrations and their tracking implementation live under `migrations/`; see [`migrations/README.md`](migrations/README.md) for the operational workflow.

Synchronize the provider GraphQL schema and gql.tada declarations with:

```bash
pnpm --filter @repo/commerce-commercetools generate
```

## Validation

```bash
pnpm --filter @repo/commerce-commercetools typecheck
pnpm --filter @repo/commerce-commercetools test
pnpm boundaries
```

Provider tests are local by default. Registration live tests run only when `COMMERCETOOLS_LIVE_TESTS=1` and the required provider configuration is set. The repository boundary task runs Biome to restrict imports of this package to application environment, Layer-composition, and CLI tooling roots, then checks which package manifests may declare the provider dependency.
