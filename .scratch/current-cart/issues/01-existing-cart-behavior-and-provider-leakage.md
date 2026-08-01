# Existing Cart behavior and provider leakage

Type: research
Status: resolved
Blocked by: None

## Question

Trace the complete current Cart call graph across storefront layout reads, anonymous Cart cookies, Cart creation, add item, quantity change, item removal, Checkout reads and mutations, Cart Policy evaluation, application runtime composition, and tests.

For every caller and operation, record:

- how the Current Cart is selected and authorized;
- which Store, Customer, associate, and Business Unit facts are required;
- which Cart data the caller consumes;
- where Commercetools SDK shapes, numeric versions, Custom Types, update actions, retry behavior, and provider failures leak across the current seam;
- the observable behavior and compatibility contract the rewrite must preserve.

Use repository source and history as primary evidence. Produce a concise current-state flow and behavior inventory without proposing the replacement design or implementing it.

## Research note

[Existing Cart behavior and provider leakage](../research/01-existing-cart-behavior-and-provider-leakage.md)

## Answer

The current Cart lifecycle is split across transport, Promise-based Cart helpers, and Checkout's Effect Layer rather than owned by one Effect Service.

- Storefront layout and mutation reads resolve Store context, read the context-matched anonymous `cart` cookie, fetch the Cart by id, and evaluate Cart Policies.
- Add item treats any failed current-Cart read as absence, creates a Store Cart, writes its id back to the same `cart` cookie, then performs the item mutation.
- Quantity and removal actions repeat the read before calling exported Commercetools persistence functions directly.
- Web Checkout separately reads the same cookie and rejects its absence; authenticated Checkout instead resolves Customer plus Business Unit Buying Context and selects exactly one active Cart in that Store through associate-scoped provider access.
- Checkout's Commercetools Layer still closes over the global Promise-based Cart service, so Cart persistence cannot be replaced through Layer composition.
- Numeric provider versions, provider-shaped Cart data, Custom Type mechanics, update actions, retry behavior, and lossy provider failures leak above the persistence implementation.

The rewrite must preserve context-matched anonymous possession, create-and-associate behavior, authenticated precedence, exact Business Unit/Store selection, non-merging of anonymous and B2B Carts, mutation-aware bounded recovery, Cart Policy results, and current public failure shielding while moving lifecycle ownership behind `CurrentCart` and provider mechanics into the Commercetools `Carts` Layer.
