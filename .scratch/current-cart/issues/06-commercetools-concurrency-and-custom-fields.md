# Commercetools concurrency and custom-field behavior

Type: grilling
Status: resolved
Blocked by: 04, 05

## Question

Define how `layerCommercetoolsCarts` preserves every Cart mutation under Commercetools optimistic concurrency while keeping versions and update actions private to the Layer.

Classify existing mutations by whether the same intent can be retried with the provider-reported version or requires reloading the same authoritative scoped Cart and rebuilding actions. Specify retry exhaustion, identity preservation, absent/matching/conflicting Custom Type evidence, explicit `null` field semantics, and when a schema-inferred custom-fields action builder is justified by concrete uses. Never restore global `ConcurrentModification` middleware or blindly repeat `setCustomType`.

## Answer

`layerCommercetoolsCarts` owns the complete optimistic-concurrency protocol for every named `Carts` mutation. The Layer may use Commercetools Cart versions, `ConcurrentModification.currentVersion`, SDK update actions, and scoped reloads internally, but none of them cross the `Carts` Service boundary. A successful mutation returns a freshly decoded `CartSnapshot`.

Conflict recovery is bounded to one recovery attempt after the initial rejected write. A second conflict becomes provider-neutral `CartWriteConflict`, containing only Cart identity and the named operation. Recovery remains local to each mutation; the global `ConcurrentModification` middleware must not return.

### Mutations that can reuse the provider-reported version

A Commercetools concurrency response proves that the first write was rejected. The Layer may therefore retry the same already-built action once with the provider-reported current version when the action does not depend on the Cart representation that lost the race:

- `addItem`: retry the same `addLineItem` intent;
- `setLineItemQuantity`: retry the same absolute target quantity;
- `removeLineItem`: retry removal of the same line identity;
- `saveDeliveryDetails`: retry the same canonical `setShippingAddress` target;
- `saveContact`: when current evidence already proves the expected Custom Type is attached, retry the same `setCustomerEmail` plus `setCustomField` target.

The retry does not silently reinterpret results. A line that disappeared before `setLineItemQuantity` or `removeLineItem` is still `CartLineItemNotFound`; the Layer does not report success merely because removal's desired end state happens to hold.

Before target-state Contact or Delivery writes, the Layer preserves the current no-op checks. When the desired semantic value is already present, it returns the current snapshot without issuing an update.

### Contact writes that require reload and rebuild

`setCustomType` is representation-dependent and must never be repeated by changing only the version. If the initial Contact action was built from evidence that the Custom Type was absent and the write conflicts, the Layer:

1. reloads the authoritative Cart through the same anonymous Store scope or authenticated Store plus Business Unit associate scope;
2. verifies that the reload has the same Cart identity as the mutation target and never redirects the write to a newly selected Cart;
3. returns the reloaded snapshot if the desired Contact and customer email are already persisted;
4. otherwise rebuilds the actions from the reloaded Custom Type evidence and makes the single recovery write.

The evidence is interpreted exactly:

- no `custom` value means the Custom Type is absent, so the rebuilt action may use `setCustomType`;
- `custom.type.key === "orderCustomFields"` means the expected type is attached, so the rebuilt action uses `setCustomField`;
- a different type key is conflicting evidence and must not be replaced;
- a `custom` value whose type key is unavailable is insufficient evidence of absence and must not be replaced.

Conflicting or insufficient Custom Type evidence becomes a typed `CartProviderFailure` with reason `invalidData`; blindly applying `setCustomType` could erase provider fields. A reload that cannot find or access the same Cart follows the already-defined `CartNotFound` or `CartAccessDenied` path rather than mutating another Cart.

### Non-conflict failures and unknown outcomes

Only decoded Commercetools optimistic-concurrency failures enter the conflict recovery path. Other provider and transport failures are not automatically replayed.

Creation and `addItem` are non-repeatable writes: when the provider may have applied the request but no result can be confirmed, the Layer returns `CartWriteOutcomeUnknown` rather than risking a duplicate Cart or quantity increase. Target-state mutations retain their operation-specific `CartProviderFailure`; callers can reload before deciding whether to repeat them.

### Custom-field scope

The initial Layer ports the current Contact-specific action construction as-is, including the private REST and GraphQL value encoding differences. It does not introduce a generic or schema-inferred custom-fields action builder. `saveContact` is the only concrete Cart use, and `CartSnapshot` deliberately exposes semantic `checkoutDetails.contact` rather than provider Custom Fields.

If a second concrete Cart use later proves that a shared writer is warranted, the abstraction must preserve three distinct update states: an omitted field leaves storage unchanged, explicit `null` clears the field, and a non-null value sets it. The current `saveContact` contract only sets a Contact and therefore does not add nullable clearing behavior speculatively.
