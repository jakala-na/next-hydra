# Cart model and typed failures across CurrentCart and Carts

Type: grilling
Status: resolved
Blocked by: 03, 04

## Question

Define the schema-backed Cart values and typed failures that cross `CurrentCart` and `Carts` without leaking Commercetools representation or weakening existing behavior.

Decide which Cart projections each Service needs, how identity and Current Cart mismatch are represented, how missing Cart and missing line-item cases differ, which provider failures callers can handle, where decoding failures belong, and whether any concrete caller-visible stale-write requirement remains after provider revision tokens are hidden.

## Confirmed decisions

- Branded `CartId` remains in the provider-neutral Cart model and in Current Cart state as observable **Cart Identity**. It supports correlation and Checkout stale-form detection but never selects or authorizes the Current Cart.
- Checkout submissions retain expected Cart identity only. `CheckoutCartMismatch` remains the failure when that submitted identity differs from the authoritative request-bound Current Cart.
- Provider resource revision disappears from every schema and Service above `layerCommercetoolsCarts`. `CheckoutCartReference.version`, `CartForCheckout.version`, and the current provider-shaped `Cart.version` do not survive the migration.
- Exhausted provider-owned concurrency recovery becomes provider-neutral `CartWriteConflict`. The internal domain language no longer calls this a version conflict. Compatibility of existing public action and HTTP error codes is decided in the caller-migration ticket.
- `Carts` and `CurrentCart` share one schema-backed `CartSnapshot`; `CurrentCartState` adds Cart Policy violations rather than introducing another nearly identical Cart projection. Checkout may continue deriving its own lean `CheckoutState` view.
- `CartSnapshot` has no generic `fields`, `customFields`, metadata, or extension bucket. A concrete Layer decodes provider-specific fields that matter to the projection into semantic properties such as `checkoutDetails.contact`; unmodeled provider fields do not cross `Carts`.
- A Cart line contains one Product Variant projection because the Product Variant is the purchasable unit. Its typed `attributes` are the effective attributes for that purchasable unit, regardless of whether a provider stores each source value on its Product or Variant. When both levels define the same attribute, the Variant value wins.
- Provider response decoding failure remains in the typed Effect error channel. It is never treated as Cart absence and never triggers replacement Cart creation.

## Answer

### Shared CartSnapshot

`Carts` returns one schema-backed `CartSnapshot`. `CurrentCart` returns that same value inside `CurrentCartState`; it does not create a second Storefront or Checkout-shaped Cart at this seam.

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

The exact implementation may use `Schema.Class` for named records, but these fields and invariants form the contract. Quantities are integers: a line-item quantity is positive, while total quantity is non-negative. Money uses integer minor units plus the existing provider-neutral currency code. Optional provider values are normalized to `undefined` at the Layer; provider `null` representation does not spread through the domain model.

`CartLineItem.variant` is the complete purchasable Product projection. It combines stable Product identity and descriptive values with Product Variant identity, SKU, images, price context, and one typed effective Attribute set. Cart callers do not receive a nested provider Product/Variant split.

The Cart model reuses the Product model's provider-neutral Attribute vocabulary rather than defining another untyped representation. A provider Layer resolves Product-origin and Variant-origin attributes into `variant.attributes`; Variant values override Product values on a key collision. Attribute origin is not retained. Commercetools `attributesRaw` is decoded and localized inside `layerCommercetoolsCarts`.

`CartSnapshot` includes only semantic data needed by current Cart callers, Cart Policies, Checkout derivation, selection validation, and named mutations. It excludes provider versions, Customer ownership, anonymous identifiers, Custom Type data, raw Custom Fields, raw attributes, provider resource objects, SDK response state, transport metadata, and unused provider fields.

Provider-specific fields are promoted only when they represent a defined Cart property. The current Checkout Contact custom field becomes `checkoutDetails.contact`; the shipping-address representation becomes `checkoutDetails.deliveryDetails`. Unknown or unused provider fields are discarded rather than copied into an extension bucket.

`CurrentCartState.violations` uses the domain term **Cart Policy Violation**. The legacy `issues` name does not survive the migration. A violation is a schema-backed stable code, optional serializable parameters, and Cart or Cart-line targets. Provider details and arbitrary metadata are not violation values. Checkout may normalize those violations into its existing global `CheckoutViolation` list.

### Cart identity and stale submissions

`CartSnapshot.id` is **Cart Identity**. It may be displayed, logged, stored in the anonymous `cart` cookie, and included in a Checkout form as an expected identity. It does not authorize a Cart and is never a selector accepted by `CurrentCart` programs.

Checkout compares the submitted identity with the identity returned by the authoritative request-bound `CurrentCart`. A difference remains `CheckoutCartMismatch`. The submitted Checkout reference contains no version. The request-bound Service retains the selected Current Cart across that Checkout use-case program, so the later named mutation does not accept the submitted identity again.

There is no caller-visible stale-write token. Provider revision and conflict payloads stay inside `layerCommercetoolsCarts`. A conflict that remains after permitted recovery is `CartWriteConflict`, containing stable Cart identity and operation only.

### Carts failures

`Carts` uses `Schema.TaggedErrorClass` for stable failures and operation-specific unions. The shared error vocabulary is:

- `CartNotFound`: a named mutation's Cart target no longer exists;
- `CartLineItemNotFound`: the Cart exists but the requested line item does not;
- `CartMerchandiseUnavailable`: an add cannot use the requested Product or Product Variant;
- `CartAccessDenied`: the supplied verified Cart target cannot be accessed through the required provider scope;
- `CartWriteConflict`: provider-owned conflict recovery was exhausted;
- `CartWriteOutcomeUnknown`: the provider may have applied a non-repeatable write but its result cannot be confirmed;
- `CartProviderFailure`: an external provider operation failed for another stable integration reason.

`CartProviderFailure` carries the named operation, a reason such as `unavailable`, `invalidData`, or `unexpectedResponse`, and an optional internal `Schema.Defect` cause for diagnostics. Provider response `SchemaError` is wrapped as `reason: "invalidData"`. It does not cross as raw `SchemaError`, collapse to `Option.none`, or become a defect. Public HTTP/action mapping does not serialize the internal cause.

Read programs use `Option.none` only for confirmed absence. Provider availability, access, and decode failures remain failures. `findActiveForBusinessUnit` returns candidates and therefore never produces `CurrentCartSelectionConflict`; that rule belongs to `CurrentCart`.

Each program exposes only applicable failures:

- discovery: `CartAccessDenied | CartProviderFailure` plus successful absence;
- creation: `CartAccessDenied | CartProviderFailure | CartWriteOutcomeUnknown` when creation outcome cannot be established;
- add item: missing Cart, unavailable merchandise, access denial, write conflict, outcome unknown, or provider failure;
- set quantity: missing Cart, missing line item, access denial, write conflict, or provider failure;
- remove line item: missing Cart, missing line item, access denial, write conflict, or provider failure;
- save Contact and Delivery Details: missing Cart, access denial, write conflict, or provider failure.

Ticket [Commercetools concurrency and custom-field behavior](06-commercetools-concurrency-and-custom-fields.md) specifies which Commercetools failures map to conflict versus outcome unknown and when a write can safely be retried.

### CurrentCart failures

`CurrentCart` translates persistence failures into buyer/session semantics rather than blindly exposing every `Carts` failure:

- `get` returns `Option.none` only for authoritative absence and may fail with `CurrentCartSelectionConflict`, `CartProviderFailure`, or `CartPolicyFailure`;
- a mutation that requires an existing Cart maps confirmed missing or inaccessible target state to `CurrentCartUnavailable` with `noCart` or `inaccessibleCart`;
- missing line item and unavailable merchandise remain distinct operation-specific failures because callers can refresh or correct the action;
- `CartWriteConflict` and `CartWriteOutcomeUnknown` remain distinct because retry advice differs;
- failure to persist a newly created anonymous Cart ID is `CurrentCartOperationFailure` with operation `set`, separate from provider Cart persistence;
- inability to evaluate the separate `CartPolicies` Service is `CartPolicyFailure`, while Cart Policy Violations remain successful `CurrentCartState.violations` data.

`CheckoutCartMismatch` belongs to `CheckoutSession`, which owns stale-form comparison and Checkout error mapping. It is not a `Carts` failure and is not accepted by `CurrentCart` as authority.

Invalid application inputs are rejected by their request/action Schemas before these Service programs run. Impossible internal states remain defects. External provider failures, including invalid provider data, remain typed because the application boundary must map and observe them without confusing them with ordinary Cart absence.
