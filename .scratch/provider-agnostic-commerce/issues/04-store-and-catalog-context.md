# Store and catalog context

Type: grilling
Status: resolved
Blocked by: 01, 02

## Question

Define how provider-agnostic Store selection and Product Catalog context reach Product Discovery without exposing Commercetools distribution-channel IDs, supply-channel IDs, Product Selection assignments, or locale-embedded provider predicates.

Include buyer-specific pricing context: the Commercetools Layer may resolve a customer group or equivalent provider pricing segment from `CommerceContext`, but Product Price exposes only the selected result. Define cache ownership and cache keys so a locale-only or Store-only cache cannot serve one buyer segment's Product Price to another.

Start from the existing request-scoped `CommerceContext` and domain-accepted Store key, locale, and currency. Decide whether Product Discovery consumes `CommerceContext`, a provider-neutral Store/market context Service, or operation inputs; which Service owns sellability, effective pricing, and inventory interpretation; how a future Store selector fits; and which catalog rules belong inside the provider Layer versus provider-independent orchestration.

Preserve current behavior: Store-by-locale selection, the first configured distribution channel for price selection, all configured supply channels for availability, and Product Selection variant inclusion/exclusion. The public answer must express those outcomes in commerce language rather than expose how Commercetools computes them.

## Confirmed decisions

- Product Discovery depends directly on the request-scoped `CommerceContext` through its Commercetools Layer. Product Discovery methods accept only use-case selectors such as Product slug, Category ID, limit, and excluded Product ID; callers do not pass Store, locale, currency, buyer identity, channel IDs, or provider context.
- Do not introduce a parallel public Store, Market, or Product Discovery context Service. The request boundary selects the Store when constructing `CommerceContextRequest`; a future Store selector changes that boundary input without changing Product Discovery callers.
- The Commercetools Product Discovery Layer privately resolves Store resources, Product Selection assignments, pricing channels, supply channels, and buyer pricing membership from `CommerceContext` and provider services.
- Every authenticated Customer with at least one verified Business Unit Membership in the Store receives a Buying Context. Commerce Context uses the requested Business Unit when it is verified; otherwise it deterministically selects the first verified membership. It fails with `noBuyingContext` only when there are no eligible memberships. A stale or tampered selector cannot grant membership and safely falls back to the default verified membership.
- The Business Unit cookie records an explicit buyer choice; Commerce Context does not need cookie access or a cookie write to apply the deterministic default. Business Unit presentation must use the same resolution rule. This avoids introducing public-price behavior for authenticated Customers.
- Product Catalog is the set of Products and Variants eligible in the current Store. The provider Layer owns resolution of provider catalog mechanics and returns only the outcome; Commercetools Product Selection assignments and inclusion/exclusion rules are not public commerce models.
- Product Card aggregates are derived only from Store-eligible Variants. Correct the current inconsistency where Product Selection rules merely prove that one eligible Variant exists but starting price and availability are then computed from all unfiltered Variants. Product Detail and Product Card must use the same resolved Product Catalog.
- Replace the cart- and checkout-scoped context names with shared commerce-domain values. `CommerceContext.store` is a `Store` containing `storeKey`, `CommerceLocale`, and currency. Carts, Product Discovery, Checkout, and Registration reuse it. `CartStore` and non-Checkout uses of `CheckoutLocale` are removed.
- The domain Store does not expose provider Store ID, channels, Product Selections, languages, countries, name, or resource version. The Commercetools package aliases its SDK Store type internally when necessary rather than weakening the canonical domain name.
- Remove the current cross-request collection-level `"use cache"` during the first provider-agnostic extraction. Resolved Product Card and Product Detail models contain Buying-Context-specific pricing and contextual availability, so locale-only or Store-only caching is unsafe.
- The request-scoped provider Layer may memoize Store and catalog resolution within a request. A future cross-request cache for resolved Product models must conservatively key query inputs, Store key, locale, currency, Customer ID, and Business Unit ID; provider pricing/catalog revisions, invalidation, and inventory freshness remain provider-owned concerns. Provider-internal caches may use more precise provider dimensions without exposing them.
- The request boundary resolves the domain Store entirely from provider-neutral `@repo/commerce` configuration before constructing `CommerceContextRequest`. It uses an explicitly selected configured and eligible Store when available, otherwise the locale's configured default Store, and resolves the current currency from that configuration. The boundary performs no provider Store lookup.
- A future Store selector supplies only an optional domain Store Key to the same resolver. The Commercetools Product Discovery Layer translates the resolved domain Store into its provider Store resource and channels internally. This focused Store resolver does not require another request-scoped context Service.

## Answer

### Domain and request boundary

`CommerceContext` is the single request-scoped commerce context consumed by Product Discovery, Cart, Checkout, Address Book, and other context-sensitive commerce capabilities:

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

The request boundary constructs it in two provider-neutral steps:

```text
locale + optional selected StoreKey
  -> Store configuration resolver
  -> Store

Store + authenticated/anonymous request identity + optional selected BusinessUnitId
  -> CommerceContext Layer
  -> CommerceContext
```

The Store configuration resolver lives in `@repo/commerce`. It selects an explicitly requested configured and eligible Store when available, otherwise the locale's configured default, and obtains the Store's locale and currency from configuration. It performs no provider lookup. A future Store selector changes only the optional `StoreKey` supplied at this boundary.

For an authenticated Customer, Commerce Context selects the requested Business Unit only when the Customer has a verified membership in it; otherwise it selects the deterministic first verified membership. The selector cookie records only an explicit choice. Missing, stale, or tampered choices fall back safely, while no eligible membership fails with `noBuyingContext`. Anonymous identity resolution remains unchanged.

### Effect Service and Layer composition

Product Discovery is a provider-agnostic Effect Service. Its methods accept only selectors belonging to the use case, such as Product slug, Category ID, limit, and excluded Product ID. They do not accept Store, locale, currency, buyer identity, provider Store data, channel IDs, or an Effect runner.

At the application composition root, the Commercetools Product Discovery Layer depends on `CommerceContext` plus Commercetools clients and configuration and provides `ProductDiscovery`:

```text
CommerceContext
Commercetools client/configuration
  -> productDiscoveryCommercetoolsLayer
  -> ProductDiscovery
```

The Layer translates the domain `StoreKey` into the provider Store resource and privately resolves the first configured pricing channel, all configured inventory channels, Product Selection assignments, and any buyer pricing membership required by Commercetools. These are Layer implementation details, not public method inputs or domain models. Request-local resolution may be memoized inside the Layer.

### Store, Product Catalog, price, and availability

- Store selection is provider-neutral domain configuration owned by `@repo/commerce`.
- Product Catalog means the Products and Variants eligible in the current Store. Product Selection assignments and their inclusion/exclusion mechanics belong entirely to the Commercetools implementation.
- Product Price is the effective price already selected for the current Store and buyer. The Commercetools implementation initially preserves the first distribution-channel rule and resolves customer-group or equivalent segmented pricing internally.
- Product Availability is the effective contextual result. The Commercetools implementation initially preserves summing inventory across all Store supply channels and considering a positive total available for sale.
- Product Card and Product Detail contain only Store-eligible Variants. Product Card starting price and availability are aggregated from that filtered set, correcting the current behavior that tests catalog eligibility with filtered Variants but calculates its aggregates from the original unfiltered set.

Core commerce does not introduce a `ProductPolicies` Service for these provider mechanics. A future provider-independent catalog or saleability rule would justify provider-neutral orchestration only when an actual shared rule exists.

### Store switching

A Store selector presents domain Stores and persists a `StoreKey`, not a provider Store ID. On the next request, the same boundary resolver rebuilds `CommerceContext`; Product Discovery, Current Cart, and Checkout consequently observe the new Store without receiving new parameters or acquiring selector knowledge. The selected Store can therefore change the active Cart or Checkout just as changing Buying Context does.

### Cache ownership

Remove the current collection-level `"use cache"` during extraction. Resolved Product models contain buyer-specific prices and contextual availability, so a locale-only or Store-only cross-request cache is incorrect.

Request-scoped memoization of provider Store and catalog resolution is safe. A future cross-request cache of resolved Product models must at minimum distinguish the query inputs, Store key, locale, currency, Customer ID, and Business Unit ID. Provider-specific price and catalog revisions, invalidation, inventory freshness, and any more precise cache dimensions remain owned by the provider implementation and do not enter public commerce types.

### Failure and preservation rules

- A configured domain Store that cannot be resolved by the active provider is a typed Product Discovery/provider failure; ticket 07 defines the final Service error vocabulary.
- An authenticated Customer with no verified Store membership fails with `noBuyingContext`; a missing or invalid Business Unit selection does not.
- A Product or Variant excluded by the Store's Product Catalog is absent from Product Discovery results.
- A quote-only eligible Variant may have no Product Price.
- Missing eligible inventory is represented through the resolved Product Availability according to the current Commercetools rule.
- Existing Store-by-locale defaults, first-channel pricing, all-supply-channel availability, Product Selection inclusion/exclusion, and buyer-segment price selection are preserved as behavior while their Commercetools mechanisms disappear behind the Layer.

Ticket 07 defines the exact `ProductDiscovery` method and error surface. This ticket fixes the context flow and ownership so that surface does not need to expose provider mechanics.
