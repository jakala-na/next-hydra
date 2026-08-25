# Current Cart Service and Provider Layers

Type: wayfinder:map
Status: complete

## Destination

Produce an implementation-ready specification and incremental commit sequence for replacing the existing Cart service/repository seam with a provider-neutral `CurrentCart` Effect Service and a provider-neutral `Carts` Effect Service. `CurrentCart` orchestrates every buyer-facing Cart use case against the Current Cart selected from verified Store, anonymous possession, and Business Unit Buying Context. A Commercetools Layer initially provides `Carts`, while application Layer composition permits a different commerce-provider Layer later.

Preserve current behavior while defining Current Cart resolution, typed failures, Cart data exposed across the services, custom-field writing, concurrency recovery, Layer composition, caller migration, and validation. Cookies, authentication, provider payloads, Custom Type mechanics, and provider revision tokens stay outside the `CurrentCart` interface.

## Notes

- The planning destination is complete and production implementation is now authorized. Keep implementation aligned with the resolved tickets and record corrections here instead of creating a competing path.
- Use Effect-native vocabulary in map discussions and tickets: `Context.Service`, Service, Layer, Effect program, and Layer composition. Do not substitute generic plugin, port, adapter, repository, or service-interface terminology when an exact Effect concept exists.
- Consult `effect-solutions` before proposing Effect patterns. Relevant guides currently include `services-and-layers`, `data-modeling`, `error-handling`, and `testing`.
- `CurrentCart` is the application-facing Service. Storefront, Checkout, and other buyer-facing use cases call it rather than selecting arbitrary Carts through `Carts`.
- `Carts` is the provider-neutral Service supplied to the `CurrentCart` Layer. `layerCommercetoolsCarts` is its initial production Layer; test Layers prove substitutability.
- `CommerceContext` is the request-scoped Effect Service for the verified Store, principal, and current-customer profile access. Boundaries supply a `CommerceContextRequest` containing trusted Store/authentication facts and an optional Business Unit selector; `CommerceContext` derives Customer ID and validates Business Unit membership through `CommerceAccounts`. The provider-selected `AddressBook` Layer depends on it and exposes identity-free `list`, `get`, and `save`; no `CurrentAddressBook` wrapper exists.
- Effect HTTP middleware and Next request entry points read cookies, headers, authentication, locale, Store, and optional Business Unit selection, then provide `CurrentCart` itself for one request. `CurrentCartCookie` contains only anonymous cookie `set` and best-effort `clear`; anonymous Cart possession and resolved authenticated identity live in `CommerceContext`. HTTP uses a request-local `Ref` for the pending `cart` cookie change.
- A submitted Cart ID is not authority. The Current Cart is selected from verified request-bound context.
- Provider revisions, Commercetools update actions, SDK payloads, Custom Type mechanics, action rebuilding, and bounded concurrency recovery remain inside the Commercetools `Carts` Layer.
- Do not add an opaque provider-neutral revision merely because Commercetools exposes numeric versions. Introduce caller-visible stale-write state only if a concrete behavior requires it.
- Preserve anonymous Store scope and authenticated Store plus Business Unit associate scope. Anonymous and B2B Carts remain separate.
- Buying Context may be switched from any route, including Checkout. The web switcher displays the Business Unit Label, persists only the selected Business Unit ID in the `business-unit-id` cookie, and lets the resulting server render resolve that context's Current Cart and Checkout.
- Migrate the whole existing Cart seam coherently. Do not introduce a temporary Checkout-only Cart Service.
- Treat Shipping Options only as a future consumer that tests Service depth. Shipping Options design and implementation are out of scope.
- The existing code and `git log` are the implementation-history source. Do not restate committed diffs in this map.
- Refer to this map and its tickets by their names in user-facing discussion.

## Decisions so far

- [Existing Cart behavior and provider leakage](issues/01-existing-cart-behavior-and-provider-leakage.md) — Current Cart selection and creation are split across cookie helpers, storefront actions, global Cart modules, and Checkout's Effect Layer; provider versions, shapes, failures, Custom Types, and retries leak above persistence.
- [Current Cart scope and lifecycle](issues/02-current-cart-scope-and-lifecycle.md) — Provide `CurrentCart` directly per request; `CommerceContext` holds trusted anonymous or authenticated B2B selection, while a separate cookie-only `set`/`clear` seam preserves the exact `cart` cookie across creation and later failures without duplicating identity or exposing transport and provider revisions.
- [CurrentCart Effect Service contract](issues/03-current-cart-effect-service-contract.md) — Expose one named Effect Service method per Cart action; every mutation returns fresh Current Cart state with violations evaluated through the separate `CartPolicies` Service, while request scope, arbitrary Cart authority, provider revisions, and generic update commands remain hidden.
- [Carts Effect Service and provider Layers](issues/04-carts-effect-service-and-provider-layers.md) — Supply a process-level `Carts` Service with named discovery, creation, and persistence programs; provider Layers own complete conflict-safe writes, while `CurrentCart` interprets Business Unit candidates and provider choice remains ordinary Layer composition.
- [Cart model and typed failures across CurrentCart and Carts](issues/05-cart-model-and-typed-failures.md) — Share one schema-backed `CartSnapshot` whose Cart lines contain a purchasable Product Variant with effective Attributes and no extension bucket; retain Cart identity but no provider revision, and distinguish absence, missing line, conflicts, unknown write outcomes, policy failures, Current Cart operation failures, and typed provider decoding failures.
- [Commercetools concurrency and custom-field behavior](issues/06-commercetools-concurrency-and-custom-fields.md) — Keep one bounded, mutation-local conflict recovery inside `layerCommercetoolsCarts`; reload and rebuild only representation-dependent `setCustomType` Contact writes, and port the concrete Contact writer without a speculative generic custom-fields builder.
- [Effect Layer composition and Cart caller migration](issues/07-effect-layer-composition-and-caller-migration.md) — Select `Carts`, `CommerceAccounts`, and the Address Book Layer recipe at application composition; provide `CommerceContext`, `CurrentCart`, `AddressBook`, and `CheckoutSession` freshly at each Next or Effect HTTP request; keep request resolution private to request Layers; migrate callers coherently; and delete floating action programs, transport-only context tags, shallow Current-service wrappers, and the old singleton Cart seam.
- [Implementation-ready Current Cart specification](issues/08-implementation-ready-current-cart-specification.md) — Consolidate the resolved architecture into the canonical implementation specification with six coherent commits, behavior-focused Effect Service tests, validation gates, and no competing tracker path.

## Not yet specified

No additional fog is currently sharp enough to add beyond the live child tickets.

## Out of scope

- Shipping Options behavior or presentation.
- Implementing a second production commerce provider.
- A runtime plugin registry, dynamic plugin discovery, or provider-package loading framework beyond normal Effect Layer composition.
- Merging anonymous and authenticated B2B Carts.
- Redesigning unrelated Store, Checkout, Cart Policy, or presentation behavior unless required to preserve an existing Cart caller contract.
