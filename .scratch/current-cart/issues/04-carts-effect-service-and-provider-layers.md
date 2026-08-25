# Carts Effect Service and provider Layers

Type: grilling
Status: resolved
Blocked by: 01, 03

## Question

Define the provider-neutral `Carts` `Context.Service` required by the `CurrentCart` Layer and the Layer contracts that make commerce providers substitutable through normal Effect composition.

Specify which provider-independent operations and data cross the Service seam, what `layerCommercetoolsCarts` owns, how test Layers exercise the same contract, which dependencies are supplied through Layer composition, and which details remain private to a provider Layer. Do not design a separate runtime plugin framework or mirror the Commercetools SDK method-for-method.

## Answer

`Carts` is the process-level, provider-neutral persistence `Context.Service` used by the request-bound `CurrentCart` Layer. It exposes named Cart programs rather than Commercetools queries, update actions, a generic command program, or a provider-created selected-Cart handle:

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

Every method returns an Effect with `R = never`. Concrete provider dependencies are captured by the Layer that supplies `Carts`.

### Reads, candidates, and authority

`findById` is the lower-level arbitrary Cart lookup required for an anonymous possessed Cart reference. `Carts` does not read cookies and does not decide that possession exists. `CurrentCart` obtains the verified anonymous reference and Store from `CommerceContext`, then verifies that the returned Cart is active and belongs to that Store before treating it as current.

`findActiveForBusinessUnit` accepts the verified Customer, Business Unit Buying Context, Store, and locale needed for provider-scoped lookup. It returns the active provider-neutral Cart candidates rather than applying the Current Cart cardinality rule. A provider may cap its query at two results because callers only need to distinguish zero, one, and more than one.

`CurrentCart` owns that business rule:

- zero candidates means authoritative Current Cart absence;
- one candidate becomes the Current Cart;
- more than one candidate produces `CurrentCartSelectionConflict`.

This separation keeps `Carts` responsible for persisted Cart discovery while `CurrentCart` decides which Cart, if any, is current for the buyer.

### Creation and mutations

Anonymous and Business Unit creation remain separate programs because they require materially different ownership and provider authorization. Both receive provider-neutral Store facts. Business Unit creation additionally receives the verified Customer and Business Unit Buying Context. The concrete Layer resolves provider Store references, distribution channels, ownership fields, and endpoint mechanics.

Every mutation receives a provider-neutral Cart target plus only its action-specific domain value. A Cart target identifies the Cart and distinguishes direct anonymous access from verified Business Unit associate access. Its precise schema belongs to [Cart model and typed failures across CurrentCart and Carts](05-cart-model-and-typed-failures.md), but it never contains a provider revision, SDK object, cookie/header value, or provider update action.

The mutation programs mirror the named persistence capabilities required by `CurrentCart`, not the Commercetools SDK. The duplication is intentional: `CurrentCart` owns buyer/session orchestration and Cart Policies, while `Carts` owns complete provider persistence for each action.

Each mutation resolves the provider's authoritative Cart state and revision internally, applies the named operation, performs any permitted operation-aware concurrency recovery, and returns a fresh provider-neutral `CartSnapshot`. `CurrentCart` never performs read-version-write choreography. If the chosen provider write endpoint does not return a sufficient Cart representation, `Carts` performs the follow-up read before succeeding.

The exact retry rules, outcome-unknown behavior, action rebuilding, and no-op handling are specified in [Commercetools concurrency and custom-field behavior](06-commercetools-concurrency-and-custom-fields.md). The exact `CartSnapshot`, Cart target, and typed failure schemas are specified in the model ticket.

### Commercetools Layer

`layerCommercetoolsCarts` is the initial production Layer supplying `Carts`. It owns all Commercetools-specific behavior:

- GraphQL versus platform SDK and `asAssociate` request selection;
- Customer associate and Business Unit request construction;
- Store identifiers, distribution-channel resolution, and active-Cart predicates;
- Cart resource versions, conflict responses, reloads, action rebuilding, and bounded retry policy;
- GraphQL fragments, SDK Cart shapes, response decoding, and provider error inspection;
- Custom Type keys, Custom Field names, JSON encoding, shipping-address conversion, and update-action construction;
- mapping provider results and failures into the schema-backed values defined for `Carts`.

It does not depend on `CurrentCart`, `CommerceContext`, the private cookie seam, cookies, headers, `CartPolicies`, or `CheckoutSession`. Provider clients, configuration, and Store-reference lookup are captured by the Commercetools Layer or supplied through provider-infrastructure Layers; they never become requirements of `Carts` methods.

The application selects its provider through ordinary Layer composition:

```ts
const commerceRuntimeLayer = Layer.mergeAll(
  layerCommercetoolsCarts,
  // other process-level commerce Layers
)
```

A future provider supplies another `Layer<Carts, ..., ...>` at that same composition point. `CurrentCart` and its application callers do not branch on provider identity. No runtime registry, plugin discovery protocol, provider switch inside a method, or parallel provider-specific Service is introduced.

### Test Layers and contract tests

`Carts.layerMemory(seed)` creates a fresh in-memory Layer per test and implements the same named Service methods. It models:

- arbitrary Cart lookup without treating lookup input as buyer authority;
- zero, one, and multiple active Business Unit candidates;
- Store and Business Unit ownership on creation;
- add, absolute quantity change, removal, canonical Contact, and canonical Delivery Details persistence;
- missing Cart, missing line item, unavailable merchandise, access, and injected provider failure cases;
- fresh post-write `CartSnapshot` results.

The memory Layer does not imitate Commercetools versions, GraphQL/REST selection, update-action arrays, Custom Fields, or retry mechanics. Those belong to focused tests of `layerCommercetoolsCarts`. A provider-neutral contract suite runs the observable `Carts` behavior against the memory Layer and each production provider Layer. Focused orchestration tests may provide `Layer.succeed(Carts, Carts.of(...))` to force a specific typed result without expanding the production Service with test-control methods.

The rejected selected-Cart capability would have returned mutation functions closing over a provider revision. Although the number stayed hidden, it would make `CurrentCart` manage a provider-created handle and replacement lifecycle whose purpose is Commercetools concurrency. Complete named `Carts` programs keep that lifecycle inside `layerCommercetoolsCarts` instead.
