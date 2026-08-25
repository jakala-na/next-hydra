# Remaining provider leakage and dependency graph

Type: research
Status: resolved
Blocked by: None

## Question

Trace every remaining Commercetools-specific dependency in and around `packages/commerce` after the Current Cart and Checkout refactor.

For each dependency cluster, record:

- the current callers and import direction;
- the provider primitive that leaks, if any;
- the provider-neutral domain model or Effect Service already present;
- whether the code belongs in future `@repo/commerce`, future `@repo/commerce-commercetools`, an application composition root, or another existing domain package;
- any dependency cycle or behavior-preservation constraint that affects extraction order.

Cover Product Discovery and Catalog, Store catalog resolution, pricing and inventory channels, product attributes and generated schemas, GraphQL and SDK clients, custom fields, schema/type generation, migrations and CLI commands, key-value storage, Registration provider queries, environment configuration, application Layer composition, React components, Next Server Actions, tests, and documentation. Distinguish universal domain identities such as Store or Business Unit IDs from provider-only mechanics such as numeric versions, GraphQL fragments, Commercetools predicate strings, and channel IDs used internally for pricing or inventory.

Use current repository source as the primary evidence. Produce a concise dependency graph and ranked list of candidate extraction slices without designing the final interfaces or implementing changes.

## Answer

The remaining provider leakage forms six ordered clusters rather than one Product-only problem:

1. Product Catalog and Store eligibility code exposes raw Commercetools filters, Product Projections, Product Selections, channel IDs, fragments, attribute encodings, and provider-shaped DTOs through Promise singletons.
2. The provider-neutral Cart, Account, Address Book, Commerce Context, and Checkout Service seams are sound, but their Commercetools Layers, legacy persistence Cart shape, action builders, Store lookup, and product/price decoders still physically live in `@repo/commerce`.
3. SDK/GraphQL clients, OAuth configuration, generated schema/cache files, and provider dependencies make the package itself Commercetools-specific.
4. Custom Type and product-type generation, schema assets, migrations, and CLI commands are provider tooling currently owned by core.
5. The generic `VersionedKeyValueStore` is already correctly independent, while its Commercetools Layer and the Commercetools Registration query implementation belong in the future provider package.
6. Web, API, and CLI composition/configuration imports plus tests and documentation must switch only after the runtime seams are deep enough to preserve a one-way provider-package-to-core dependency.

Product Catalog/Discovery is the best next behavior slice, but it must include the provider-agnostic Product model and Store catalog semantics. The physical package split is the last proof step. Moving files first would retain provider-shaped contracts or introduce a forbidden `@repo/commerce` to `@repo/commerce-commercetools` dependency.
