# Product Discovery Service and provider Layer contract

Type: grilling
Status: resolved
Blocked by: 03, 04

## Question

Define the deep `ProductDiscovery` Effect Service contract and the Commercetools Layer that replaces the current Promise-based `productService`, `productRepo`, Store repository choreography, GraphQL fragments, and provider-shaped mappers.

Specify named Service methods, intent-specific inputs, provider-neutral outputs, absence and typed failure behavior, pagination and ordering, category and related-product filtering, cache ownership, dependencies captured by Layer composition, test Layers, and provider contract tests. Keep Commercetools query strings, Product Projection shapes, Product Selection mechanics, distribution/supply channels, GraphQL decoding, and provider error inspection inside `layerCommercetoolsProductDiscovery`.

Do not expose a generic provider query language or accept the current raw Commercetools `filter` string merely to make migration easy.

## Confirmed decisions

- `ProductDiscovery` is one provider-neutral `Context.Service` in `@repo/commerce/product`. It exposes `findBySlug` and `listCards`; both return Effects whose environment is `never` because `CommerceContext`, provider clients, configuration, and other dependencies are captured by Layer composition.
- `findBySlug(ProductSlug)` returns `Option<ProductDetail>`. No matching Product and a matching Product with no Store-eligible Variant are normal absence, not failures. A malformed matching provider projection or failed provider request is a typed `ProductDiscoveryFailure`.
- `listCards(ListProductCardsInput)` accepts only optional `CategoryId`, a positive collection limit, and optional excluded `ProductId`. It returns at most that many Store-eligible Product Cards ordered by localized title ascending. No raw predicate, Store, locale, currency, buyer identity, provider channel, cursor, or sort expression is public.
- Do not add `listRelatedProducts`. The current code has no relatedness model; `excludeProductId` merely prevents the current Product from appearing in a category or curated collection. Name a related-products method only when a real relevance rule exists.
- The first contract is a bounded collection read, not a browse/search API. It has no offset, cursor, total count, facets, or caller-selected ordering. A future PLP or search experience gets its own input and paged result instead of widening this method around Commercetools Product Projection Search.
- One `ProductDiscoveryFailure` tagged error carries the failed operation and underlying cause. Do not create separate query, Store, channel, selection, mapping, or GraphQL error types at the Service boundary. Product absence remains `Option.none`; invalid boundary input is rejected by its Effect Schema before invoking the Service.
- The Commercetools implementation lives in `@repo/commerce-commercetools/product` and publicly exports `productDiscoveryLayer`. GraphQL documents, Product Projection fragments, Store and Product Selection resolution, pricing and inventory channel mechanics, generated provider types, response inspection, decoding, and mapping remain private to that module.
- Product Card and Product Detail are decoded directly into the schemas fixed in ticket 03 after applying the Product Catalog rules fixed in ticket 04. Product Card price and saleability are calculated from the same eligible Variants used to admit the Product; the current all-Variant aggregate bug is not preserved.
- A malformed exact Product Detail result fails the lookup so a data defect is not disguised as a 404. A malformed Product Card is logged with provider Product identity and omitted from the collection so one bad catalog entry does not remove an otherwise valid block. Request/query failures still fail the complete collection operation.
- Core owns a co-located `ProductDiscovery.testLayer` for orchestration and boundary tests. Provider query, mapping, catalog, pricing, inventory, and malformed-projection tests remain in the Commercetools product module; no exported generic contract-test framework is added.

## Answer

### Core Service

The core contract is deliberately smaller than the current `productService` plus `productRepo` surface:

```ts
export class ListProductCardsInput extends Schema.Class<ListProductCardsInput>(
  "ListProductCardsInput"
)({
  categoryId: Schema.optional(CategoryId),
  limit: Schema.Int.check(Schema.isGreaterThan(0)),
  excludeProductId: Schema.optional(ProductId),
}) {}

export const ProductDiscoveryOperation = Schema.Literals([
  "findBySlug",
  "listCards",
])

export class ProductDiscoveryFailure extends Schema.TaggedErrorClass<ProductDiscoveryFailure>()(
  "ProductDiscoveryFailure",
  {
    operation: ProductDiscoveryOperation,
    message: Schema.String,
    cause: Schema.optional(Schema.Defect),
  }
) {}

export class ProductDiscovery extends Context.Service<
  ProductDiscovery,
  {
    readonly findBySlug: (
      slug: ProductSlug
    ) => Effect.Effect<Option.Option<ProductDetail>, ProductDiscoveryFailure>

    readonly listCards: (
      input: ListProductCardsInput
    ) => Effect.Effect<readonly ProductCard[], ProductDiscoveryFailure>
  }
>()("@repo/commerce/ProductDiscovery") {
  static readonly testLayer = /* fresh leaf implementation from test handlers */
}
```

The exact Effect Schema combinator used to express a positive integer should follow the installed v4 API during implementation. The limit remains an ordinary number after decoding: its positivity is a boundary constraint, not a separate domain identity. No Commercetools maximum is encoded into it.

`findBySlug` is the only current Product Detail lookup. The route boundary decodes its string parameter to `ProductSlug`; Product Discovery obtains locale and all buying context from its Layer. The method name and `Option` make absence explicit without a second `ProductNotFound` error.

`listCards` supports the actual Product Collection call sites:

- without `categoryId`, return an all-products collection within the current Product Catalog;
- with `categoryId`, restrict to Products directly assigned to that Category; descendant-category expansion is not promised because the current behavior does not implement it;
- with `excludeProductId`, omit that Product before returning the bounded result; and
- return Products ordered by localized title ascending for the current Commerce Context locale.

`limit` is the maximum number of returned valid cards, not a pagination contract or guarantee that the result is filled. Fewer results are valid when the catalog, category, exclusion, or malformed-entry omission leaves fewer eligible Products. The presentation layer keeps its current default of three; the Service does not own that UI default.

### Failure and decoding behavior

The Service has one recoverable operation error:

```text
ProductDiscoveryFailure
  operation: findBySlug | listCards
  message: stable developer-readable context
  cause: external/provider/Schema failure when available
```

This single error is the boundary for provider Store lookup, GraphQL/network failure, response error, provider model decoding, generated Attribute decoding, and mapping failure. The provider module may use narrower private errors internally, but it maps them once before exposing the Service.

Absence is not failure:

- no localized slug match -> `Option.none`;
- Product excluded from the Store catalog -> `Option.none` or omitted card;
- no Store-eligible Variant -> `Option.none` or omitted card;
- empty category/all-products result -> `[]`.

Required domain data is not fabricated. For an exact detail lookup, an invalid Product ID, slug, title, Product Type, typed Attributes, Variant identity, Default Variant invariant, image URL, Money, or other required schema value fails with `ProductDiscoveryFailure`. For a card collection, an invalid individual card is logged and omitted; the log includes the provider Product identity when safely available and the decode cause, without leaking provider data through the Service error or return model.

Optional price remains valid for quote-only Variants. Missing quantity remains valid when saleability is known. Those cases are not decode failures.

### Commercetools Layer

The provider package module has a small public surface:

```text
@repo/commerce-commercetools/product
  -> productDiscoveryLayer

private:
  queries.ts
  product-detail.ts
  product-card.ts
  catalog.ts
  price.ts
  availability.ts
  attributes.ts
```

The filenames are illustrative module internals, not additional public Services. The one public Layer provides `ProductDiscovery` and captures:

- request-scoped `CommerceContext`;
- Commercetools GraphQL/client and validated provider configuration;
- provider Store resolution from the domain Store Key;
- the first configured pricing channel, all configured inventory channels, and buyer pricing membership;
- Product Selection assignments and Variant inclusion/exclusion; and
- generated Product Attribute decoders.

The Layer's method implementation performs this call graph:

```text
ProductDiscovery.findBySlug(ProductSlug)
  -> CommerceContext Store + principal
  -> resolve Commercetools Store/product-discovery context privately
  -> localized slug query
  -> Product Selection assignments
  -> filter to Store-eligible Variants
  -> resolve selected prices + contextual availability
  -> decode ProductDetail
  -> Option<ProductDetail>
```

```text
ProductDiscovery.listCards({ categoryId?, limit, excludeProductId? })
  -> CommerceContext Store + principal
  -> resolve Commercetools Store/product-discovery context privately
  -> structured category/all-products query, title ascending
  -> Product Selection assignments
  -> filter Store-eligible Variants
  -> exclude Product ID
  -> derive startingPrice and availableForSale from eligible Variants only
  -> decode/omit individual Product Cards
  -> at most limit ProductCards
```

The provider may use Commercetools string predicates and locale-embedded sort expressions in its private query builder. Category and excluded Product values originate as decoded branded IDs and are bound or escaped inside that implementation; callers never construct query syntax. The raw Store repository and Product repository disappear as public choreography. If private helpers remain, they are implementation details of `productDiscoveryLayer`, not Services exposed to core or app callers.

Provider Store, Product Selection, and buyer-pricing resolution may be memoized inside the request-scoped Layer. The named Layer instance supplied through `@repo/commerce/layers` is unbuilt at module scope and is built with fresh Commerce Context for each boundary execution.

### Ordering, pagination, and caching

Localized title ascending is part of `listCards` behavior, not a caller-controlled sort string. The first migration preserves that visible order. Equal-title ordering remains unspecified until a consumer needs stable pagination.

Do not expose provider offset/cursor mechanics yet. Product Collection consumes a bounded list and does not render page controls or total counts. A future browse/search method should return a separate schema-backed page model with a provider-neutral continuation token, total/facet semantics only if the UI needs them, and explicit supported ordering. It must not retrofit those concerns into `listCards` merely because Commercetools exposes Product Projection Search.

Remove the current `"use cache"`. Neither Product Discovery nor its Commercetools Layer owns a cross-request Next cache in this extraction. Request-local Layer memoization is allowed. Future provider-internal caches may use provider-specific identities and revisions privately; future resolved Product caches must obey the Commerce Context key and invalidation rules fixed in tickets 04 and 06.

### Tests

`ProductDiscovery.testLayer` is a fresh leaf Layer configured with test handlers or seeded lookup results. It lets Product Collection, Product Detail, metadata, CMS integration, and other core orchestration tests provide deterministic `findBySlug` and `listCards` results or a deliberate `ProductDiscoveryFailure` without importing provider fixtures.

Core tests cover:

- `Option.none` to Product `notFound()` at the package page boundary;
- empty collection to no rendered block;
- domain input decoding and stable failure mapping; and
- Product Card/Detail to presentation, metadata, and JSON-LD projection.

Commercetools product-module tests cover:

- locale and domain Store translation without public channel leakage;
- exact slug, optional Category, excluded Product, limit, and title ordering query behavior;
- Product Selection inclusion, exclusion, and no-assignment behavior;
- Product Card aggregates derived only from eligible Variants;
- Product Detail Default Variant selection after catalog filtering;
- regular, discounted, quote-only, and buyer-segment-selected prices;
- inventory summed across the configured Store supply channels;
- typed generated Product Attribute decoding;
- provider request/GraphQL failures mapped to one `ProductDiscoveryFailure` operation; and
- malformed exact details fail while malformed cards are logged and omitted.

No generic provider contract-test package is required. These tests exercise the Commercetools Layer through the core `ProductDiscovery` Service interface and keep query/mapping fixtures inside the provider package.
