# Commerce Context, Address Book, and Checkout seams

Type: research
Status: resolved
Blocked by: None

## Question

Trace the current repository code to determine:

- how authenticated Buying Context and associate-scoped Commercetools access are resolved;
- where Business Unit addresses are currently created and represented;
- how Manual Delivery Details input, domain details, Cart persistence, Server Actions, HTTP adapters, action state, and Checkout UI are separated;
- what Issue 06 already specifies and which additional seams the Business Unit Address Book feature requires;
- which existing tests and runtime layers provide the best prior art.

Capture a concise current-state flow and identify the smallest compatible extension points without implementing them.

## Research seed

Consumed from `../research/02-current-address-book-and-checkout-seams.md` during resolution.

## Answer

Reuse the existing trusted commerce path rather than creating another identity or Cart boundary:

- WorkOS or bearer authentication resolves a verified Customer principal.
- `CommerceAccounts` resolves the single Business Unit Buying Context inside the locale's Store.
- B2B Cart reads and writes remain associate- and Business Unit-scoped.
- the existing Cart persistence path continues to own the resolved Shipping Address and Cart version checks.

Introduce one separate Business Unit `AddressBook` Effect capability. It owns provider-independent list, resolve, and idempotent add operations. Its Commercetools Layer owns provider address projections, associate-scoped Business Unit operations, versions, permissions, and provider error translation. Provide one request-scoped `CommerceContext` after `CommerceAccounts` resolves identity and Buying Context; the `AddressBook` Layer depends on it so callers use `list`, `get`, and `save` without passing Customer or Business Unit identity. `CommerceContext` also owns current-customer profile lookup, so `CheckoutSession` no longer calls `CommerceAccounts` directly.

Separate submitted intent from persisted Checkout Details. The Delivery Details action input becomes a schema-backed union representing:

- a new Cart-only Shipping Address;
- an existing Address Book Reference;
- a new Shipping Address with explicit Address Book save intent and stable retry reference.

After resolution, all three variants produce the existing resolved `CheckoutDeliveryDetails` shape. Checkout State and the Cart continue to expose the resolved Shipping Address rather than an Address Book catalog or persisted reference.

`CheckoutSession.saveDeliveryDetails` remains the orchestration boundary: resolve or add through Address Book when required, then reuse the existing idempotent Cart write, version-conflict handling, policy evaluation, and state recomputation behavior. The Address Book Layer is composed beside the existing Checkout and Commerce Accounts Layers, not provided inside individual calls.

Checkout loads Address Book entries independently from Checkout State and passes them to the Delivery Details presentation. Anonymous Checkout keeps Manual only. The Next Server Action and public HTTP adapter submit the same intent union, derive identity from trusted context, map typed failures to stable codes plus localized public messages, and never accept Customer or Business Unit identity from the payload.

The existing Address Book Delivery Details issue remains useful but is incomplete: the final slicing decision must add Business Unit list/add behavior, explicit cart-only versus save-and-use intent, retry-reference preservation, independent UI loading, and focused presentation coverage.
