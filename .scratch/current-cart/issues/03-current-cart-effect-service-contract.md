# CurrentCart Effect Service contract

Type: grilling
Status: resolved
Blocked by: 01, 02

## Question

Define the deep, buyer-facing `CurrentCart` `Context.Service` contract that replaces direct storefront and Checkout use of the current Cart service/repository seam.

Starting from the resolved request-bound lifecycle, specify its Effect programs, intent-oriented inputs, Cart projections and results, typed failures, creation behavior, policy relationship, idempotency expectations, and dependencies. No public scope parameter, arbitrary Cart identifier, provider resource version, cookie/header value, or other Commercetools mechanic may appear in its interface. Ensure the contract supports existing Cart reads and mutations together rather than creating a Checkout-only partial Service.

## Confirmed decisions

- `CurrentCart` exposes one named Effect program per buyer-facing Cart action. It does not expose a generic `change`, `execute`, command union, provider action list, patch, or arbitrary update program.
- The initial program set covers reading the Current Cart, adding an item, setting line-item quantity, removing a line item, saving Checkout Contact, and saving Checkout Delivery Details.
- Each program owns its operation-specific input, result, creation rule, idempotency semantics, and typed failure channel.
- `CartPolicies` remains a separate `Context.Service` with its own Layer. The request-bound `CurrentCart` Layer depends on `CartPolicies` and invokes it so callers receive Cart Policy violations with the Current Cart instead of coordinating evaluation themselves.
- Cart Policy violations are successful domain data. Failure to evaluate Cart Policies remains a typed Effect failure from the `CurrentCart` program that requested the state.
- `CheckoutPolicies` remains a dependency of `CheckoutSession`; it does not move into `CurrentCart` because it evaluates Checkout progress and details beyond the Cart itself.

## Answer

`CurrentCart` is a request-bound `Context.Service` with one named Effect program per buyer-facing Cart action:

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

This is the complete initial public program set. Do not replace it with `change`, `execute`, an intent union, arbitrary provider actions, a patch document, or a generic update program. New Cart behavior adds another named domain program only when a concrete buyer-facing use case requires it.

### Inputs and authority

Programs accept only the domain input required by their action:

- `addItem`: Product identity, Variant identity, and positive quantity;
- `setLineItemQuantity`: line-item identity and the positive absolute quantity;
- `removeLineItem`: line-item identity;
- `saveContact`: canonical Checkout Contact already resolved by `CheckoutSession`;
- `saveDeliveryDetails`: canonical Checkout Delivery Details already resolved by `CheckoutSession`.

No program accepts Store context, Business Unit context, Customer identity, cookie or header values, an arbitrary Cart identifier, a provider revision, a provider update action, or a Commercetools Custom Field. The request-bound Service selects and retains the authoritative Current Cart from the lifecycle established by [Current Cart scope and lifecycle](02-current-cart-scope-and-lifecycle.md).

Customer-profile and Address Book lookup, allowed-source checks, optional Address Book persistence, Checkout step orchestration, and Checkout Policy evaluation remain in `CheckoutSession`. `CurrentCart` persists only the canonical Cart-owned values produced by that orchestration.

### Results and Cart Policies

`get` returns `Option.none` only for authoritative Current Cart absence and never creates. Every successful mutation returns a fresh `CurrentCartState` derived from the authoritative post-write Cart; callers do not perform a second provider read merely to refresh state.

`CurrentCartState` contains the provider-neutral Current Cart projection plus its Cart Policy violations. Its exact schema, Cart identity treatment, and failure schemas belong to [Cart model and typed failures across CurrentCart and Carts](05-cart-model-and-typed-failures.md).

`CartPolicies` remains a separate `Context.Service` with its own Layer. `CurrentCart.layer` depends on it and evaluates Cart Policies for every Cart state it returns. Violations are successful domain data, preserving the current non-blocking behavior. An inability to evaluate Cart Policies is a typed failure of the requesting `CurrentCart` program. `CheckoutPolicies` remains separate and is called by `CheckoutSession`.

### Creation and repeat behavior

- `addItem` is the only initial program that may create a missing Current Cart. For an anonymous buyer, creation establishes the request association before applying the item addition, so the association survives a later add failure. Repeating a successful or outcome-unknown `addItem` may add the quantity again; callers must not blindly retry it.
- `setLineItemQuantity` requires an existing Current Cart and expresses an absolute desired quantity. Repeating it with the same value is target-state idempotent. Quantity zero is not overloaded as removal.
- `removeLineItem` requires an existing Current Cart and preserves the current missing-line failure rather than silently treating every repeated removal as success.
- `saveContact` and `saveDeliveryDetails` require an existing Current Cart. They express canonical target state, skip a provider write when the Cart already contains that value, and are safe to repeat.

All successful mutations return the same `CurrentCartState` shape, including Contact and Delivery Details writes. Storefront actions can replace their local Cart state directly, while `CheckoutSession` can use the returned state when rebuilding Checkout State.

### Typed failure responsibilities

Each named program exposes only the failures relevant to that action. The final schema-backed types are specified in the model ticket, but the contract must distinguish:

- legitimate Current Cart absence from selection, authorization, decoding, provider, and association failures;
- ambiguous authenticated B2B selection from absence;
- missing Current Cart from missing line item or unavailable merchandise;
- exhausted concurrency recovery from provider revision details;
- anonymous association failure from Cart persistence failure;
- Cart Policy evaluation failure from successful Cart Policy violations.

Raw provider errors, provider status codes, SDK payloads, and numeric versions never cross the Service. A concrete `Carts` Layer may perform operation-aware conflict recovery, but `CurrentCart` exposes only the stable domain failure after that recovery is exhausted.

### Effect Layer contract

The live request-bound `CurrentCart` Layer depends on:

- `Carts`, supplied by the selected commerce-provider Layer;
- `CartPolicies`, supplied by its own Layer;
- the private request-bound Current Cart value established at the HTTP or Next request boundary.

Those dependencies are captured while constructing the Service. Every public method returns an Effect with `R = never`; application programs require `CurrentCart`, not its implementation dependencies. `CheckoutSession` consumes `CurrentCart` but is not a dependency of it.
