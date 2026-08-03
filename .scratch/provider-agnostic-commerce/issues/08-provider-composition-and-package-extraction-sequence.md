# Provider composition and package extraction sequence

Type: grilling
Status: resolved
Blocked by: 02, 05, 06, 07

## Question

Define the final application Layer composition and the incremental commit sequence that physically extracts `@repo/commerce-commercetools` without creating a reverse dependency from `@repo/commerce` or breaking current behavior between commits.

Specify the provider package's public Layer and tooling exports, where Web/API/CLI composition and environment aggregation live, how shared provider clients are supplied and memoized, how provider contract suites run, which files move together, and which temporary compatibility exports are acceptable. Include explicit deletion and manifest checks proving that `@repo/commerce` no longer depends on Commercetools SDKs, GraphQL schema/types, provider configuration, provider query language, Custom Type mechanics, or provider migrations.

The sequence must preserve Product Discovery, Store/assortment, Cart, Checkout, Account, Address Book, versioned storage, and Registration behavior at every commit. Do not use a temporary core-to-provider import or a runtime plugin registry to make the move easier.

## Confirmed decisions

- The Web binding module is plural and literal: package-owned boundaries import named Layers from `@repo/commerce/layers`, and `apps/web/next.config.ts` aliases that exact module to `apps/web/lib/commerce-layers.ts`. Do not call a record of context-independent and Commerce-Context-dependent Layers one `commerceLayer`.
- `apps/web/lib/commerce-layers.ts` is the only ordinary Web module that imports the installed provider package. It exports the WorkOS-backed `commerceIdentityLayer` plus the Commercetools `cartsLayer`, `commerceAccountsLayer`, `addressBookLayer`, and `productDiscoveryLayer`. Core request construction composes those named Layers in dependency order for each boundary.
- Web uses the exact build-time binding because package-owned actions and Server Components must reach host-selected Layers. API and CLI do not use that alias: they are application composition roots and import the provider capability or tooling modules directly.
- Provider REST and GraphQL client Layers and `CommercetoolsConfig.layer` are module-level constants inside the provider package. Capability Layers reuse the same constant references so Effect Layer memoization constructs one client set per composed Layer graph. No raw client is exported to applications.
- The physical provider package is introduced first as a temporary compatibility shell that re-exports provider implementations still located in core. This keeps the dependency direction provider-to-core while application imports switch once. Each capability then moves behind the same provider export. Core never re-exports a moved provider implementation and never imports the new provider package.
- Product and Store seams are deepened before their provider files move. Existing Cart, Commerce Accounts, Address Book, Versioned Store, and Registration Service contracts are preserved; their provider implementations move capability by capability with their focused tests.
- Ticket 10 is a hard gate before package-owned Web boundaries adopt `@repo/commerce/layers`. If Turbopack cannot alias a JIT package import to the app-owned module and compile its package-owned Server Action, reopen composition rather than adding a registry.

## Answer

### Final dependency and Layer composition

```text
apps/web
  next.config.ts
    @repo/commerce/layers -> apps/web/lib/commerce-layers.ts
  commerce-layers.ts
    -> @repo/auth-workos            commerceIdentityLayer
    -> @repo/commerce-commercetools carts/accounts/address-book/product Layers

  @repo/commerce package-owned page/action/block
    -> core Commerce Context request boundary
    -> named aliased Layers, composed in request dependency order
    -> one Effect.provide at the concrete boundary
```

The named Layer split is required by the actual graph:

```text
commerceIdentityLayer
commerceAccountsLayer
  -> resolve CommerceContext

cartsLayer + CartPolicies + CommerceContext
  -> CurrentCart

CommerceContext
  -> addressBookLayer
  -> productDiscoveryLayer

CurrentCart + AddressBook + policies + CommerceContext
  -> CheckoutSession
```

Merging all provider Layers into one opaque Layer before Commerce Context exists either leaves hidden requirements or creates a composition cycle. The app binding therefore selects concrete leaf Layers; core owns their request-local composition and all domain orchestration. This is still one host binding module, not a provider registry or per-action facade.

The API keeps transport-specific composition explicit:

```text
apps/api checkout runtime
  -> @repo/commerce-commercetools/cart
  -> @repo/commerce-commercetools/commerce-accounts
  -> @repo/commerce-commercetools/address-book
  -> WorkOS JWT verifier + core Cart/Checkout policy Layers

apps/api registration runtime
  -> @repo/commerce-commercetools/versioned-store
  -> @repo/commerce-commercetools/registration
  -> @repo/commerce-commercetools/commerce-accounts
  -> Registration, WorkOS, email, telemetry Layers
```

The CLI remains a thin command root:

```text
apps/cli
  -> @repo/commerce-commercetools/cli
  -> @repo/commerce-commercetools/keys
```

No API or CLI caller imports provider clients, provider config values, GraphQL documents, migrations, or raw query helpers.

### Provider package public exports

`@repo/commerce-commercetools` uses explicit `package.json` exports and no broad root barrel:

| Export | Supported surface |
| --- | --- |
| `./provider` | Named `cartsLayer`, `commerceAccountsLayer`, `addressBookLayer`, and `productDiscoveryLayer` for the Web binding module |
| `./cart` | `cartsLayer` |
| `./commerce-accounts` | `commerceAccountsLayer` |
| `./address-book` | `addressBookLayer` |
| `./product` | `productDiscoveryLayer` |
| `./versioned-store` | `versionedKeyValueStoreLayer({ container })` |
| `./registration` | `registrationQueriesLayer({ container })` |
| `./config` | `CommercetoolsConfig` and its production/test Layers for provider composition and provider tests |
| `./keys` | T3 Env server-key fragment for eager application startup validation |
| `./cli` | Commercetools command factory used by `apps/cli` |

Queries, mappers, clients, GraphQL setup/generated declarations, provider persistence types, version-retry helpers, Custom Field helpers, raw schema assets, migration internals, and test factories are not exported. Tooling can use package-relative private imports inside its own package.

Core also adopts explicit module exports for its supported domain, Service, HTTP, action, and React slices. `@repo/commerce/layers` is a real server-only fallback module for standalone typechecking and missing-binding failure; its named Layer exports match `apps/web/lib/commerce-layers.ts`. The TypeScript `@repo/*` path mapping can bypass package export enforcement, so the repository boundary check must also reject unsupported deep imports.

### Provider configuration and client lifetime

`CommercetoolsConfig.layer` reads Effect Config directly from `COMMERCETOOLS_*`, using non-empty schemas and a redacted client secret. The provider T3 Env keys remain separately imported by Web, API, and CLI env roots for eager startup validation. Both validate the same server-only variables; remove the unused `NEXT_PUBLIC_COMMERCETOOLS_*` variables.

Inside the provider package:

```text
CommercetoolsConfig.layer
  -> commercetoolsRestClientLayer
  -> commercetoolsGraphqlClientLayer
  -> shared commercetoolsClientsLayer constant
  -> capability Layers
```

Parameterized provider Layers such as Versioned Store and Registration Queries accept only their domain configuration (`container`) and close over the shared client Layer. Capability modules import the same `commercetoolsClientsLayer` constant rather than calling a client constructor repeatedly. When capabilities are merged into one API/Web graph, Effect memoizes that Layer by reference. Separate requests still receive separate request-scoped Commerce Context and orchestration; no process `ManagedRuntime` is introduced for Web.

The existing module-global SDK/URQL memoization may be preserved during movement, then replaced by the client Services in the provider package before the final core purge. The behavior contract is one configured client set per built provider graph, not a raw process singleton observable by callers.

### Incremental commit sequence

Every numbered item is intended to be independently green and reviewable. Do not combine later moves merely to make the diff look like a package split.

1. **Prove the JIT binding.** Complete ticket 10 with a package-owned Server Component and module-level Server Action importing `@repo/commerce/layers`, aliased to an app-owned test module. Prove development compilation, Turbopack build, action manifest, standalone core typecheck, and named missing-binding failure.
2. **Create the provider compatibility shell.** Add `packages/commerce-commercetools/package.json`, Effect-aware `tsconfig`, test config, explicit exports, and temporary provider-to-core re-exports for existing Carts, Commerce Accounts, Address Book, Versioned Store, keys, CLI, and Registration composition where needed. Add direct provider-package dependencies to Web, API, and CLI. No application import changes yet.
3. **Switch composition and environment imports once.** Change Web/API provider Layer roots, Web/API/CLI T3 Env roots, API Registration runtime, and CLI command root to the new provider exports. The temporary exports still execute the old implementations, so behavior is unchanged. Add `apps/web/lib/commerce-layers.ts` and the exact alias only after ticket 10 passes.
4. **Remove public provider environment variables.** Delete `NEXT_PUBLIC_COMMERCETOOLS_PROJECT_KEY` and `NEXT_PUBLIC_COMMERCETOOLS_REGION` from schemas, examples, mocks, and docs. Keep all five required server variables and verify eager T3 Env failure in Web, API, and CLI tests.
5. **Introduce provider-neutral Product schemas.** Add the ticket 03 Product Card, Product Detail, Variant, Price, Availability, Option, Category, image, identity, Money, and generated typed Attribute schemas in core with invariant tests. Do not change Product callers yet.
6. **Introduce Product Discovery.** Add the ticket 07 Service, one operation failure, input Schemas, `Option` absence, and co-located test Layer in core. Add core Service tests without provider imports.
7. **Replace provider-shaped Store context.** Add provider-neutral Store configuration and selection in core, update Commerce Context/anonymous Cart cookie inputs, and remove application dependence on provider Store IDs and channels while leaving old provider Store helpers temporarily available to provider implementations.
8. **Implement Commercetools Product Discovery in the provider package.** Add the provider product module, GraphQL queries, assortment/selection resolution, pricing, availability, Attribute decoding, malformed-projection behavior, and provider tests. It may temporarily consume provider client infrastructure still physically located in core because provider-to-core is the permitted dependency direction.
9. **Move Product React callers to the Service.** Update Product Collection, Product Detail, metadata, JSON-LD, and CMS Category decoding to use core Product models and `ProductDiscovery`. Remove raw filter strings, `productService`, `productRepo`, Product Projection DTOs, and Product/Store choreography no longer used by Cart. Remove the buyer-unsafe `"use cache"`.
10. **Centralize Web commerce request construction.** Add `CommerceIdentity`, the real core `@repo/commerce/layers` fallback module, the shared Commerce Context request boundary, and the app's named Layer binding. Replace `apps/web/lib/current-cart.ts` with the core request composition while retaining the exact cookie behavior and fresh Layer lifetime.
11. **Move the Cart Next slice into core.** Move actual Cart Server Actions, action-state mapping, and the Cart provider Server Component into `@repo/commerce/cart`; remove `inStoreAction`, the app action-result helper, app Cart actions, Layer assembly, and action props from the app layout.
12. **Move the Checkout Next slice into core.** Move the Checkout page state load, Address Book projection, actual Checkout Server Actions, FormData decoding, diagnostics, `notFound`, and revalidation into `@repo/commerce/checkout`; reduce the app route to locale validation and package page delegation.
13. **Move the Buying Context slice into core.** Move the Business Unit switcher and its action beside Commerce Context, consume the already-resolved Customer/Store/Buying Context, persist Business Unit ID, show Business Unit Label, and refresh the route. Delete the app implementations.
14. **Establish provider-local config and clients.** Add `CommercetoolsConfig`, REST and GraphQL client Services/Layers, GraphQL setup and generated declarations in the provider package. Switch Product Discovery to them. Keep the old core clients only for provider implementations not moved yet; do not make core import the new clients.
15. **Move Carts with its complete provider cluster.** Move Cart persistence, numeric versions, retry/conflict mechanics, update-action builders, Cart-specific Custom Fields, and Cart Product/Price/Attribute decoders together. Point `./cart` and `./provider` at the local `cartsLayer`; run existing Cart Layer and live tests there before deleting the old files.
16. **Move Commerce Accounts.** Move Customer, Business Unit, hierarchy, associate-role, Store membership, and Registration provisioning mechanics plus tests; keep the core Service/error/model surface unchanged.
17. **Move Address Book.** Move provider address keys, Business Unit address reads/writes, version retry, mapping, and tests; retain its `CommerceContext` Layer requirement.
18. **Move Versioned Store.** Move the Custom Object implementation and conflict/version tests behind `versionedKeyValueStoreLayer({ container })`; verify `@repo/versioned-store` still owns the contract, codec, and memory Layer.
19. **Move Registration Queries out of API.** Move `apps/api/lib/registration/providers/commercetools-registration-queries*` into the provider Registration module, update the API runtime import, and preserve filtering, keyset pagination, storage compatibility, and live tests.
20. **Move provider tooling.** Move raw Product/Custom Type schemas, Custom Field generation, gql synchronization, provider migrations and tracking, CLI commands, Commander/chalk/ora/dotenv dependencies, and provider documentation. Keep the generator's one intentional write to core's provider-neutral generated Product Attribute artifact.
21. **Purge duplicate provider infrastructure from core.** Delete the old SDK/URQL clients, GraphQL schema/generated declarations, `graphql.ts`, provider infra directory, provider custom-field helpers, migrations, CLI, raw provider schemas, T3 Env keys, and temporary compatibility re-exports. Remove every now-unused provider-shaped type/helper from core.
22. **Lock the boundary.** Add final explicit core exports, provider-import allowlists for application composition/tooling roots, the forbidden-dependency/source-import check, generated-artifact purity test, docs split, and full Web/API/CLI/package validation. The compatibility shell phase ends in this commit; no provider implementation re-export from core remains.

### Temporary compatibility rule

The only accepted bridge is:

```text
@repo/commerce-commercetools capability export
  -> temporary re-export of the existing provider implementation in @repo/commerce
```

That direction is already the destination dependency direction: provider package to contract-owning core. It allows applications to switch imports once and lets each implementation move later without another caller diff. Temporary exports are explicit per capability, contain no wildcard barrel, and are deleted as that capability moves.

Never add any of these bridges:

- an `@repo/commerce` import or re-export of `@repo/commerce-commercetools`;
- a core path alias resolving to provider source;
- a generated provider import written into core;
- a runtime provider registry or mutable global; or
- an app action wrapper whose only job is to supply a provider Layer.

### Commit validation and final proof

Run focused tests/typechecks after each commit for every changed package/application. At phase boundaries run at least:

```text
pnpm --filter @repo/commerce test
pnpm --filter @repo/commerce typecheck
pnpm --filter @repo/commerce-commercetools test
pnpm --filter @repo/commerce-commercetools typecheck
pnpm --filter @repo/registration test
pnpm --filter @repo/versioned-store test
pnpm --filter web typecheck
pnpm --filter api typecheck
pnpm --filter api test
pnpm --filter cli test
pnpm boundaries
```

The final boundary check proves:

- `@repo/commerce/package.json` has no Commercetools SDK, gql.tada, URQL, Wonka, Commander, chalk, ora, dotenv, provider T3 Env, `@repo/versioned-store`, or `@repo/commerce-commercetools` dependency left;
- core source contains no imports of the provider package, Commercetools SDKs, generated GraphQL declarations, provider query/mutation modules, provider migrations, raw schemas, client code, Custom Field mechanics, numeric resource-version handling, or provider predicate construction;
- core has no `gql/`, provider `graphql.ts`, `lib/infra/commercetools`, provider `lib/client`, provider `lib/custom-fields`, `migrations`, provider `schema`, or provider `cli` tree;
- the generated core Product Attribute artifact imports only Effect and core commerce modules and contains no Commercetools type/import vocabulary;
- `@repo/commerce-commercetools` imports contract packages, never the reverse;
- application imports of the provider package are restricted to `apps/web/lib/commerce-layers.ts`, application env roots, API Layer-composition roots, and CLI composition/tooling roots;
- CMS no longer names or passes a Commercetools Category representation into commerce; and
- Web production build contains package-owned Cart/Checkout actions and Product/CMS Server Components through the exact Layer alias, while missing alias/test hosts fail with the named unconfigured binding error.

The extraction is complete only when the old provider files and temporary re-exports are deleted, not merely when ordinary callers stop importing them.
