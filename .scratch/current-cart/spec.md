# Current Cart Service and Provider Layers

Status: implementation in progress

## Goal

Replace the global Promise-based Cart service/repository seam with two provider-neutral Effect Services:

- `CurrentCart`: the request-bound buyer capability used by Storefront and Checkout;
- `Carts`: the process-level persistence capability supplied by a commerce-provider Layer.

The implementation must preserve current Cart behavior while moving selection, creation, anonymous Cart cookie handling, Cart Policy evaluation, provider decoding, Custom Type mechanics, and optimistic concurrency to their proper Effect boundaries. `layerCommercetoolsCarts` is the first production `Carts` Layer. A future provider replaces that Layer through application composition without changing `CurrentCart` or its callers.

## Non-goals

- Shipping Options behavior or UI.
- A second production commerce provider.
- Runtime provider discovery, a plugin registry, or per-call provider selection.
- Anonymous/B2B Cart merging, transfer, or deletion on sign-in.
- A generic custom-fields writer before a second concrete Cart use requires it.
- Redesigning unrelated Store, Checkout Policy, Address Book, or presentation behavior.

## Architectural invariants

1. Storefront, Checkout, and HTTP buyer flows call `CurrentCart`; they never select or mutate an arbitrary Cart through `Carts`.
2. `CurrentCart` is freshly provided for one request/use-case program. It accepts no public scope, cookie, header, Cart id, Customer, Business Unit, provider revision, or provider update action.
3. The request boundary resolves trusted Store and buyer facts. Verified authentication takes precedence over anonymous possession.
4. `Carts` is provider-neutral and process-level. Provider choice occurs once in Layer composition.
5. Every `Carts` and `CurrentCart` method returns an Effect with `R = never`; implementation dependencies are captured while building Layers.
6. A successful mutation returns a fresh `CartSnapshot`. Callers do not perform a second provider read to refresh Cart state.
7. Cart Policy violations are successful `CurrentCartState.violations` data. `CartPolicies` is a separate Service invoked by `CurrentCart`.
8. Provider versions, Commercetools payloads, Custom Types, Custom Fields, raw attributes, and retry state never cross `layerCommercetoolsCarts`.
9. `CartSnapshot.id` is observable Cart Identity, not authority. Checkout may submit it only as an expected identity for mismatch detection.
10. Provider failures are never converted into absence. Only confirmed absence may produce `Option.none` or replacement creation.

## Target Effect graph

```text
application composition
  layerCommercetoolsCarts ─┐
  CartPolicies.layer       ├─ process-level commerce runtime
  CommerceAccounts Layer   │
  CheckoutPolicies.layer  ─┘
  AddressBook Layer recipe ─ provider choice
               │
request boundary
  verified auth + Store + cookie/header + optional Business Unit selector
               │
  CommerceContextRequest + CurrentCartCookie(set/clear)
               │
  CommerceContext.layer resolves Customer + Business Unit membership
               │
  CurrentCart.layer + AddressBook Layer
          │              │
  storefront programs    CheckoutSession.layer
```

Recommended module destinations:

- `packages/commerce/domain/cart.ts`: provider-neutral Cart schemas and Cart failures;
- `packages/commerce/services/carts.ts`: `Carts` Service and memory Layer;
- `packages/commerce/services/current-cart.ts`: `CurrentCart` Service and live orchestration Layer;
- `packages/commerce/services/commerce-context.ts`: request-scoped `CommerceContext` Service for verified principal and current-customer access;
- `packages/commerce/services/address-book.ts`: context-aware, provider-neutral `AddressBook` Service with identity-free methods;
- `packages/commerce/services/cart-policies.ts`: provider-neutral `CartPolicies` Service;
- `packages/commerce/lib/current-cart/cookie.ts`: private anonymous Cart cookie operations used only to build `CurrentCart`;
- `packages/commerce/lib/infra/commercetools/carts.ts`: `layerCommercetoolsCarts` and provider-private mapping/write logic;
- `apps/web/lib/current-cart.ts`: Next request resolution and request-specific Layers;
- Effect HTTP middleware beside the existing Checkout HTTP boundary in `apps/api/lib/checkout/http.ts` unless extraction materially improves that file.

These paths may be adjusted to match nearby modules, but the Service and Layer ownership must not change.

## Domain model

Use schema-backed named values. `Schema.Class` is preferred where construction and identity benefit from a named class.

```ts
const CartStatus = Schema.Literals(["active", "inactive"])

const CartProductVariant = Schema.Struct({
  id: VariantId,
  productId: ProductId,
  productType: Schema.optional(ProductTypeKey),
  name: Schema.optional(Schema.String),
  sku: Schema.optional(Sku),
  images: Schema.Array(ProductImage),
  attributes: ProductAttributes,
})

const CartLineItem = Schema.Struct({
  id: LineItemId,
  variant: CartProductVariant,
  quantity: PositiveCartQuantity,
  unitPrice: CartMoney,
  totalPrice: Schema.optional(CartMoney),
})

const CartSnapshot = Schema.Struct({
  id: CartId,
  status: CartStatus,
  storeKey: StoreKey,
  buyingContext: Schema.optional(BuyingContext),
  lineItems: Schema.Array(CartLineItem),
  totalLineItemQuantity: CartQuantity,
  totalPrice: CartMoney,
  checkoutDetails: CheckoutDetails,
})

const CurrentCartState = Schema.Struct({
  cart: CartSnapshot,
  violations: Schema.Array(CartPolicyViolation),
})
```

Model rules:

- line quantity is a positive integer; total quantity is a non-negative integer;
- money is integer minor units plus provider-neutral currency code;
- provider `null` is normalized to domain `undefined`;
- `variant` is the complete purchasable Product projection;
- `variant.attributes` uses the Product model's typed Attribute vocabulary and combines provider Product- and Variant-origin values; Variant wins a key collision and origin is discarded;
- `checkoutDetails.contact` and `checkoutDetails.deliveryDetails` are semantic Cart properties projected from provider storage;
- there is no generic `fields`, `customFields`, `metadata`, or extension bucket;
- provider resource version, ownership internals, raw Custom Fields, raw attributes, SDK objects, and unused provider fields are excluded.

### Provider-neutral Cart target

`Carts` mutations need a trusted provider-neutral target assembled only by `CurrentCart`. It distinguishes anonymous direct access from Business Unit associate access without carrying transport or provider revision data:

```ts
const CartStore = Schema.Struct({
  locale: Locale,
  storeKey: StoreKey,
  currency: CurrencyCode,
})

const CartTarget = Schema.Union([
  Schema.Struct({
    _tag: Schema.Literal("AnonymousCartTarget"),
    id: CartId,
    store: CartStore,
  }),
  Schema.Struct({
    _tag: Schema.Literal("BusinessUnitCartTarget"),
    id: CartId,
    store: CartStore,
    customerId: CommerceCustomerId,
    businessUnitId: CommerceBusinessUnitId,
    businessUnitKey: CommerceBusinessUnitKey,
  }),
])
```

Provider Store ids, distribution-channel keys, endpoint selection, and associate request shapes are resolved inside the Commercetools infrastructure Layer from these provider-neutral facts and its own dependencies.

## Carts Service

`Carts` exposes complete persistence programs, not provider commands or a selected-Cart handle:

```ts
type CartsShape = {
  readonly findById: (
    input: FindCartById
  ) => Effect.Effect<Option.Option<CartSnapshot>, FindCartByIdFailure>

  readonly findActiveForBusinessUnit: (
    input: FindActiveCartsForBusinessUnit
  ) => Effect.Effect<ReadonlyArray<CartSnapshot>, FindCartsFailure>

  readonly createAnonymous: (
    input: CreateAnonymousCart
  ) => Effect.Effect<CartSnapshot, CreateAnonymousCartFailure>

  readonly createForBusinessUnit: (
    input: CreateBusinessUnitCart
  ) => Effect.Effect<CartSnapshot, CreateBusinessUnitCartFailure>

  readonly addItem: (
    input: AddCartItem
  ) => Effect.Effect<CartSnapshot, AddCartItemFailure>

  readonly setLineItemQuantity: (
    input: SetCartLineItemQuantity
  ) => Effect.Effect<CartSnapshot, SetCartLineItemQuantityFailure>

  readonly removeLineItem: (
    input: RemoveCartLineItem
  ) => Effect.Effect<CartSnapshot, RemoveCartLineItemFailure>

  readonly saveContact: (
    input: SaveCartContact
  ) => Effect.Effect<CartSnapshot, SaveCartContactFailure>

  readonly saveDeliveryDetails: (
    input: SaveCartDeliveryDetails
  ) => Effect.Effect<CartSnapshot, SaveCartDeliveryDetailsFailure>
}
```

Discovery and selection responsibilities:

- `findById` receives trusted anonymous possession facts from `CurrentCart`; `Carts` does not read cookies or confer authority itself;
- `findActiveForBusinessUnit` receives verified Customer, Business Unit, Store, and locale facts and returns up to two active candidates;
- zero/one/many interpretation belongs to `CurrentCart`, not `Carts`;
- each mutation accepts `CartTarget` plus only its action-specific domain value;
- every mutation resolves authoritative provider state/revision, writes, recovers permitted conflicts, decodes, and returns `CartSnapshot` internally.

### Carts failures

Define stable `Schema.TaggedErrorClass` failures and operation-specific unions:

- `CartNotFound`;
- `CartLineItemNotFound`;
- `CartMerchandiseUnavailable`;
- `CartAccessDenied`;
- `CartWriteConflict` with Cart identity and operation only;
- `CartWriteOutcomeUnknown` for a possibly-applied non-repeatable write;
- `CartProviderFailure` with operation, `unavailable | invalidData | unexpectedResponse`, and optional internal `Schema.Defect` cause.

Reads return `Option.none` only for confirmed absence. Provider decoding errors become `CartProviderFailure` with `invalidData`, never absence or defects. Public mappings never serialize internal causes.

### Carts memory Layer

`Carts.layerMemory(seed)` creates fresh state per test and implements the same observable contract:

- direct lookup and zero/one/many B2B candidates;
- anonymous and Business Unit creation ownership;
- all five named mutations and fresh post-write snapshots;
- missing Cart/line, unavailable merchandise, access denial, and injectable stable failures.

It must not model Commercetools versions, update actions, Custom Types, GraphQL/REST differences, or conflict algorithms.

## CurrentCart Service

`CurrentCart` is the only buyer-facing Cart Service:

```ts
type CurrentCartShape = {
  readonly get: () => Effect.Effect<
    Option.Option<CurrentCartState>,
    CurrentCartReadFailure
  >

  readonly addItem: (
    input: AddCurrentCartItem
  ) => Effect.Effect<CurrentCartState, AddCurrentCartItemFailure>

  readonly setLineItemQuantity: (
    input: SetCurrentCartLineItemQuantity
  ) => Effect.Effect<CurrentCartState, SetCurrentCartLineItemQuantityFailure>

  readonly removeLineItem: (
    input: RemoveCurrentCartLineItem
  ) => Effect.Effect<CurrentCartState, RemoveCurrentCartLineItemFailure>

  readonly saveContact: (
    contact: CheckoutContact
  ) => Effect.Effect<CurrentCartState, SaveCurrentCartContactFailure>

  readonly saveDeliveryDetails: (
    details: CheckoutDeliveryDetails
  ) => Effect.Effect<CurrentCartState, SaveCurrentCartDeliveryDetailsFailure>
}
```

Do not add `change`, `execute`, a command union, an arbitrary update program, a provider action list, or a patch API.

Inputs contain only buyer intent:

- add: Product id, Variant id, positive quantity;
- quantity: line-item id and positive absolute quantity;
- remove: line-item id;
- Contact and Delivery Details: canonical values already resolved by `CheckoutSession`.

`CurrentCart.layer` depends on `Carts`, `CartPolicies`, `CommerceContext`, and the private cookie seam. It pins one provider-neutral Current Cart target for the lifetime of the provided Service so an expected-identity check and subsequent mutation cannot drift to another candidate during the use-case. The pin never contains a provider revision. Successful mutations replace the Service's semantic snapshot for any later operation in the same program.

`get` never creates. Only `addItem` may create an absent Cart. All returned snapshots are evaluated by `CartPolicies` before becoming `CurrentCartState`.

Repeat behavior:

- `addItem` is non-repeatable; an outcome-unknown result must not be blindly retried;
- `setLineItemQuantity` is an absolute target and safe to repeat; zero is not removal;
- repeated removal preserves `CartLineItemNotFound` rather than becoming implicit success;
- Contact and Delivery Details are target state, skip provider writes when already equal, and are safe to repeat.

### CurrentCart failures

- `get`: `CurrentCartSelectionConflict | CartProviderFailure | CartPolicyFailure`, plus successful absence;
- required-Cart mutations map missing or inaccessible targets to `CurrentCartUnavailable` with `noCart | inaccessibleCart`;
- missing line and unavailable merchandise remain distinct;
- `CartWriteConflict` and `CartWriteOutcomeUnknown` remain distinct;
- failure to persist a newly created anonymous Cart ID is `CurrentCartOperationFailure` with operation `set`;
- Cart Policy execution failure is `CartPolicyFailure`; violations remain success data.

`CheckoutCartMismatch` remains owned by `CheckoutSession`.

## Current Cart cookie and lifecycle

`CurrentCartCookie` is the transport seam used by `CurrentCart` to persist anonymous Cart cookie changes. It is an implementation input to `CurrentCart.layer`, not an application-facing domain Service and not a second context or identity bag:

```ts
interface CurrentCartCookie {
  readonly set: (
    id: CartId
  ) => Effect.Effect<void, CurrentCartOperationFailure>
  readonly clear: () => Effect.Effect<void>
}
```

Store, anonymous Cart possession, Customer, and Business Unit identity come from the request-scoped `CommerceContext`. Authenticated boundaries provide no-op cookie operations because authenticated Current Cart never changes the anonymous cookie.

Anonymous rules:

- decode cookie name `cart` only when currency, locale, and Store key match;
- no anonymous Cart ID means ordinary absence; the request still has an anonymous `CommerceContext`, so Checkout absence is not `noPrincipal`;
- a confirmed missing, inactive, or wrong-Store anonymous Cart ID may be cleared and treated as absent;
- provider, access, network, and decoding failures do not clear or replace the cookie;
- on add with no Current Cart, create, set the anonymous Cart ID, then add;
- the new Cart ID remains set when create succeeds but add later fails;
- cookie remains HTTP-only, production-secure, SameSite `lax`, path `/`, max age 90 days.

Authenticated B2B rules:

- verified auth wins over anonymous possession;
- the request boundary supplies verified Auth User ID, Store, and an optional Business Unit ID selector in `CommerceContextRequest`;
- `CommerceContext` derives Customer ID, asks `CommerceAccounts` for Store-scoped Business Unit memberships, validates an explicit selector, or selects the sole membership when no selector is supplied;
- each membership carries a provider-neutral Business Unit Label for presentation; the web switcher displays that label and stores only the selected Business Unit ID in the `business-unit-id` cookie;
- Buying Context may be switched during Checkout; the cookie-setting Server Action triggers a server rerender that resolves the newly selected context's Current Cart and never reuses the previous Checkout State;
- zero active candidates is absence, one is Current Cart, more than one is `CurrentCartSelectionConflict`;
- add may create a Business Unit Cart on absence without touching the anonymous cookie;
- missing/ambiguous commerce identity is typed context failure, not anonymous fallback;
- sign-in does not merge, clear, transfer, or delete the anonymous Cart.

Arbitrary submitted Cart ids never establish authority.

## Transport composition

### Next Server Components and Server Actions

The web application provides `nextCurrentCartLayer(locale)` around direct `CurrentCart` method calls and `nextCheckoutLayer(locale)` around direct `AddressBook` or `CheckoutSession` method calls. Those locale-based Layers keep request access private: they read verified auth, Store, and `cookies()` once, construct `CommerceContextRequest` plus `CurrentCartCookie`, provide `CommerceContext`, and build fresh request-bound Services around the concrete request Effect. `CommerceContext` owns Customer and Business Unit membership resolution. The selected Address Book Layer and `CheckoutSession.layer` both depend on it; their methods never accept scope or context.

- Server Actions use the captured cookie store's `set`; stale-cookie `clear` is best-effort so Server Component reads do not fail when Next.js prohibits cookie mutation.
- Request-specific Layers are never stored in the module-level runtime.

### Effect HTTP

`CheckoutSessionMiddleware` provides `AddressBook` and `CheckoutSession` and requires the process Services used to resolve verified context plus the application-selected Address Book Layer recipe. The request-bound `CurrentCart` is supplied privately to `CheckoutSession`. The middleware:

1. reads `HttpServerRequest` headers and cookies;
2. preserves valid bearer-auth precedence, then matching cookie, then supported `x-context-anonymous-cart-id` possession;
3. allocates `Ref<Option<AnonymousCartCookieChange>>`;
4. registers `HttpEffect.appendPreResponseHandler`;
5. builds `CommerceContextRequest` plus `CurrentCartCookie`, provides `CommerceContext.layer(request)`, and builds `CurrentCart`, the selected Address Book Layer, and `CheckoutSession.layer` around the endpoint effect.

`set` and `clear` only update the request-local Ref. The pre-response hook reads the final change and immutably sets or expires `cart` on `HttpServerResponse`. It applies to successful and mapped error responses.

Do not use `FiberRef`, `Context.Reference`, or Effect `Scope` as request context.

## Commercetools Layer

`layerCommercetoolsCarts` owns:

- GraphQL and platform SDK clients;
- direct versus `asAssociate`/Business Unit endpoint choice;
- Store references, distribution channel resolution, active predicates, and provider ownership fields;
- provider Cart versions and `ConcurrentModification.currentVersion`;
- update actions, Custom Type evidence, Custom Field names/encoding, and address conversion;
- response schema decoding and provider failure inspection;
- bounded mutation-local conflict recovery;
- semantic projection into `CartSnapshot`.

### Conflict rules

Allow one recovery write after the initial rejected write. A second conflict is `CartWriteConflict`. Never restore global `ConcurrentModification` middleware.

The same built action may be retried once with the provider-reported version for:

- `addItem`;
- absolute quantity change;
- removal;
- canonical Shipping Address save;
- Contact save when the expected Custom Type is already attached and the action uses `setCustomField`.

`setCustomType` cannot be repeated by changing only the version. On its conflict:

1. reload through the same Store/anonymous or Store/Business Unit target;
2. verify identical Cart identity;
3. return success if desired Contact and email are already persisted;
4. rebuild from refreshed evidence and perform the one recovery write.

Custom Type evidence:

- no `custom`: absent, so `setCustomType` is allowed;
- type key `orderCustomFields`: matching, so use `setCustomField`;
- another key: conflicting, do not replace;
- `custom` with unavailable type key: insufficient evidence, do not replace.

Conflicting/insufficient evidence becomes `CartProviderFailure` with `invalidData`. The first implementation ports the current Contact-specific builder and private REST/GraphQL encoding as-is. It does not introduce a generic schema-inferred writer.

If a later second use justifies a shared writer, omitted means unchanged, explicit `null` means clear, and non-null means set. `saveContact` itself has no speculative clear operation.

Only decoded optimistic-concurrency failures enter conflict recovery. Other provider/transport failures are not replayed automatically. Creation and add return `CartWriteOutcomeUnknown` when their result may have been applied but cannot be confirmed.

## Cart Policies and CheckoutSession

`CartPolicies` is a separate `Context.Service`. `CurrentCart` invokes it for every returned Cart state. Remove direct `validateCartPolicies` calls from layouts, actions, and the Commercetools Checkout Layer.

`CheckoutSession.layer` is provider-neutral and request-bound. It obtains verified request facts from `CommerceContext`, derives `CheckoutScope` once, and depends on:

- `CurrentCart`;
- `CommerceContext`;
- `AddressBook`;
- `CheckoutPolicies`;

`CommerceContext` owns the verified principal and current-customer profile lookup through `CommerceAccounts`. The provider-selected `AddressBook` Layer depends on `CommerceContext` and exposes `list`, `get`, and `save` without accepting caller-supplied identity. `CheckoutSession` consumes `AddressBook` for Delivery Details resolution/save but does not expose or own Address Book catalog loading.

CheckoutSession methods accept only operation-specific input; they never accept scope, context, request values, or Layers. The Service retains Contact source/profile resolution, Delivery Details normalization, Checkout Policy evaluation, step construction, and stale submitted Cart-identity comparison. It consumes Current Cart violations and calls named Current Cart mutations. Successful Contact and Delivery mutations build Checkout State from the mutation-returned state without a second Cart read.

Delete `layerCommercetoolsCheckoutSession` and `checkoutRuntimeLayerCommercetools`.

## Caller compatibility

### Storefront

- keep exported `addToCart`, `changeCartItemsQuantity`, and `removeCartItem` names and buyer-intent inputs;
- keep the `next-safe-action` success/error envelope and generic UI failure shielding;
- migrate success data atomically from `CartWithIssues` to `CurrentCartState`;
- update `CartProvider` to `violations` and `CartSnapshot.lineItems[].variant`;
- retain the request-scoped Cart promise/Suspense behavior and client replacement from mutation results;
- authenticated Storefront requests now follow the shared B2B Current Cart rule;
- do not add Cart cache tags or route revalidation for Storefront mutations.

### Web Checkout

- keep submitted Cart id for `CheckoutCartMismatch`;
- remove `cartVersion` hidden fields and schemas;
- preserve Contact/Delivery success revalidation of `/{locale}/checkout`;
- preserve revalidation for mismatch, exhausted conflict, and partial Address Book failure cases.

### Checkout HTTP

- remove Cart version from `CheckoutApiState`, `CheckoutCartReference`, Contact/Delivery payloads, OpenAPI, fixtures, and tests in one atomic migration;
- do not add a compatibility version or opaque revision;
- preserve `checkout.versionConflict` as the public 409 code mapped from internal `CartWriteConflict`;
- preserve current 400/404/409/500 shielding, localized messages, auth precedence, and cookie-over-header anonymous precedence;
- use mutation-returned Current Cart state to return fresh Checkout API state without a second read.

## Incremental implementation plan

Every commit must compile, retain one provider implementation, and include its behavior-focused tests.

### Commit 1: Define provider-neutral Cart Services

Suggested commit: `feat(commerce): define current cart services`

- add final Cart schemas, target schemas, and typed failures;
- add `Carts`, `CurrentCart`, and `CartPolicies` Service contracts;
- add `Carts.layerMemory(seed)` and provider-neutral contract tests;
- no production caller changes.

Validation:

```sh
pnpm --filter @repo/commerce test
pnpm --filter @repo/commerce typecheck
```

### Commit 2: Move Commercetools Cart persistence into Carts

Suggested commit: `refactor(commerce): provide carts with commercetools`

- move the existing GraphQL/SDK behavior behind `layerCommercetoolsCarts`;
- implement final projection, failure decoding, scoped targets, conflict classification, and Contact-specific custom-field handling;
- move/refocus repository tests on the Layer;
- temporarily delegate old exports to the same private provider implementation; do not duplicate requests or algorithms.

Validation:

```sh
pnpm --filter @repo/commerce test
pnpm --filter @repo/commerce typecheck
```

### Commit 3: Provide CurrentCart per request

Suggested commit: `feat(commerce): provide request-bound current cart`

- implement `CurrentCart.layer` selection, creation, target pinning, state replacement, and Cart Policy evaluation;
- implement `CommerceContextRequest` resolution and the private `CurrentCartCookie` seam;
- add shared context-resolution rules, a single Next request helper, and Effect HTTP cart-cookie handling;
- test absence, invalid anonymous Cart cookies, authenticated precedence, zero/one/many B2B candidates, cookie set on create, post-create add failure, and policy failures;
- leave production Cart callers on the old seam.

Validation:

```sh
pnpm --filter @repo/commerce test
pnpm --filter @repo/commerce typecheck
pnpm --filter api test
pnpm --filter api typecheck
pnpm --filter web typecheck
```

### Commit 4: Migrate Storefront Cart callers

Suggested commit: `refactor(commerce): use current cart in storefront`

- switch locale layout read and all three Cart Server Actions;
- migrate action contracts and `CartProvider` to `CurrentCartState`;
- add Storefront action tests for creation and cookie setting, B2B selection, success state, typed failure shielding, and unknown add outcome;
- remove `getCartForContext`, action-owned cookie changes, direct repository calls, and direct policy evaluation used by Storefront.

Validation:

```sh
pnpm --filter @repo/commerce test
pnpm --filter @repo/design-system test
pnpm --filter @repo/commerce typecheck
pnpm --filter @repo/design-system typecheck
pnpm --filter web typecheck
```

### Commit 5: Migrate CheckoutSession, web Checkout, and HTTP together

Suggested commit: `refactor(checkout): use request-bound current cart`

- provide `CommerceContext.layer(request)`, make the selected Address Book Layer depend on it, and make `CheckoutSession.layer` consume `CommerceContext`, `CurrentCart`, and `AddressBook`;
- switch Checkout page and Server Actions to direct `CheckoutSession` methods provided by `nextCheckoutLayer(locale)`;
- move FormData decoding and action-state mapping into the Next Server Action and delete floating `ForScope`/`ForContext` Effect programs;
- switch Checkout HTTP handlers to `CheckoutSession`, switch the Address Book handler to `AddressBook`, and delete transport-only Checkout context/scope tags plus the shallow `CurrentAddressBook` wrapper;
- remove provider revision from domain, forms, HTTP schemas, OpenAPI, fixtures, and tests;
- preserve public error codes, Address Book partial-failure parameters, auth precedence, and revalidation;
- replace post-mutation provider reads with mutation-returned state;
- replace `CheckoutSession.layerMemoryFrom` tests with composed test Layers.

Validation:

```sh
pnpm --filter @repo/commerce test
pnpm --filter api test
pnpm --filter @repo/commerce typecheck
pnpm --filter api typecheck
pnpm --filter web typecheck
```

### Commit 6: Delete the superseded Cart seam

Suggested commit: `refactor(commerce): remove legacy cart seam`

- delete `cart.service.ts`;
- delete the temporary `cartRepo` facade and provider-shaped service/repository types;
- delete `layerCommercetoolsCheckoutSession`, `checkoutRuntimeLayerCommercetools`, obsolete provider projections/action helpers, singleton module mocks, and stale README examples;
- retain only the cookie codec/options in the transport boundary and provider mechanics under `layerCommercetoolsCarts`;
- update `packages/commerce/CONTEXT.md` if implementation names differ from this specification.

Required search gates:

```sh
rg -n "cartService|cartRepo|getCartForContext|CheckoutVersionConflict|checkoutRuntimeLayerCommercetools|layerCommercetoolsCheckoutSession" apps packages
rg -n "version" packages/commerce/services/current-cart.ts packages/commerce/services/carts.ts packages/commerce/domain/cart.ts
rg -n "validateCartPolicies" apps packages/commerce/actions packages/commerce/lib/checkout
```

The first two searches must return no prohibited caller/service leakage. Any remaining `validateCartPolicies` reference must be the implementation behind `CartPolicies`, not a caller.

Validation:

```sh
pnpm --filter @repo/commerce test
pnpm --filter api test
pnpm --filter @repo/design-system test
pnpm turbo typecheck --concurrency=1
pnpm lint
pnpm turbo build --filter=web --filter=api
```

## Acceptance criteria

- [ ] Storefront and Checkout use only request-provided `CurrentCart` for buyer Cart behavior.
- [ ] `CurrentCart` exposes exactly the six named Service methods in this specification.
- [ ] `Carts` exposes exactly the named discovery, creation, and mutation methods required by `CurrentCart`.
- [ ] Provider choice occurs only in Layer composition.
- [ ] Anonymous cookie behavior and authenticated B2B selection satisfy the lifecycle rules.
- [ ] Only add creates a missing Cart, and the anonymous Cart ID remains set when the later add fails.
- [ ] All successful mutations return fresh `CurrentCartState`.
- [ ] Cart Policy violations are returned as `violations`; direct caller evaluation and legacy `issues` are gone.
- [ ] Cart lines expose one purchasable `variant` with effective typed Attributes.
- [ ] No provider version or generic provider fields bucket crosses `layerCommercetoolsCarts`.
- [ ] Commercetools recovery is bounded, mutation-local, identity-preserving, and never globally installed.
- [ ] `setCustomType` is never blindly version-forward retried.
- [ ] The current Contact-specific builder is ported without introducing a generic custom-fields writer.
- [ ] Checkout payloads retain Cart identity but contain no version; `checkout.versionConflict` remains the public conflict code.
- [ ] Memory Layers test provider-neutral behavior without imitating Commercetools mechanics.
- [ ] `CheckoutSession` tests compose real Services instead of duplicating orchestration in a memory Session.
- [ ] The global Cart service/repository seam and temporary migration exports are deleted.
- [ ] All commit-specific and final validation gates pass.

## Tracker disposition

The former Checkout ticket `.scratch/checkout-effect-slice/issues/08-effect-cart-operations-and-custom-fields-writer.md` is `wontfix` and points to the Current Cart Wayfinder map. Its provisional Cart Operations and mandatory generic writer design is not an implementation path.

This specification and `.scratch/current-cart/map.md` remain the canonical implementation path for this rewrite. The authorized production implementation follows this path; it does not resume the superseded Checkout ticket.
