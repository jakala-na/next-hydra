# @repo/commerce

Provider-neutral commerce domain models, Effect Services, orchestration, and Next.js integration modules.

This package defines what the application can do with commerce. It does not contain provider clients, credentials, queries, resource versions, migrations, or schema tooling. The installed provider implements these Services in a separate package.

## Ownership

`@repo/commerce` owns:

- Product, Cart, Checkout, account, address, Money, and Store domain schemas;
- provider-neutral Effect Services such as `ProductDiscovery`, `Carts`, `CommerceAccounts`, and `AddressBook`;
- orchestration Services such as `CommerceContext` and `CurrentCart`;
- Cart and Checkout policies;
- provider-neutral HTTP contracts; and
- package-owned Next.js Server Components and Server Actions for Product, Cart, Checkout, and Buying Context flows.

Provider implementations own transport, authentication, provider projections, configuration, optimistic concurrency, and operational tooling. The installed Commercetools implementation is documented in [`@repo/commerce-commercetools`](../commerce-commercetools/README.md).

## Public modules

The package uses explicit exports. Supported entry points include:

- `@repo/commerce/product`, `cart`, `checkout`, and `commerce-context` for application integrations;
- `@repo/commerce/store` and `domain/*` for provider-neutral schemas;
- `@repo/commerce/services/*` for Effect Service contracts; and
- `@repo/commerce/http/*` for provider-neutral HTTP schemas and projections.

Internal files that are not listed in `package.json` exports are not supported package APIs.

## Provider composition

Package-owned Next.js boundaries import the stable `@repo/commerce/layers` binding. The Web application maps that exact specifier to its selected provider Layers at build time. Core commerce therefore remains independently type-checkable and never imports the provider or authentication implementation.

API applications compose the provider's capability Layers at their own runtime roots. Ordinary routes, pages, actions, components, and domain programs consume the Services defined here rather than provider modules.

## Product Attribute generation

The selected provider may generate the committed Product Attribute Effect Schemas at `product/generated/attributes.ts`. That artifact is part of the core domain and may import only Effect and modules inside this package. Boundary tests reject provider imports and raw provider field-kind vocabulary.

## Validation

```bash
pnpm --filter @repo/commerce typecheck
pnpm --filter @repo/commerce test
pnpm boundaries
```

The boundary task runs Biome's provider-import restrictions, then validates explicit exports, package dependency direction, provider-owned paths, and generated-artifact purity.
