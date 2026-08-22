# Current Cart scope and lifecycle

Type: grilling
Status: resolved
Blocked by: None

## Question

Define the provider-neutral scope and lifecycle rules for selecting the Current Cart.

Cover anonymous possession with and without an existing Cart reference, authenticated B2B selection from verified Customer, Store, and Business Unit Buying Context, creation when no Current Cart exists, the result an outer transport needs to persist a new anonymous Cart reference, sign-in behavior, missing or inaccessible Carts, and the rule that arbitrary submitted Cart IDs never grant authority.

Keep cookies, headers, authentication SDKs, and Commercetools query mechanics outside the domain rules and Effect Service contracts.

## Answer

Provide `CurrentCart` itself as a request-bound `Context.Service`. Storefront, Checkout, and HTTP endpoint programs use `CurrentCart` without accepting a public scope value or arbitrary Cart identifier. A process-level commerce Layer provides `Carts`; each request boundary resolves trusted request facts, constructs the `CurrentCart` implementation for that request, and provides it lexically around one use-case program.

### Request-bound Effect composition

`CurrentCart.layer` depends on `Carts`, `CartPolicies`, `CommerceContext`, and a private `CurrentCartCookie` value. `CommerceContext` is the single request-scoped source of Store and verified principal facts. `CurrentCartCookie` is only the transport seam for `set` plus best-effort `clear` effects on the anonymous `cart` cookie; it is not an application-facing Service or identity bag. Authenticated boundaries provide no-op cookie operations.

Effect HTTP middleware declares that it provides `CurrentCart` and requires `Carts` plus the Services needed to resolve Store and verified buyer context. It reads `HttpServerRequest`, constructs `CommerceContextRequest`, creates a fresh request-local `Ref` for a pending `cart` cookie change, registers one pre-response handler, supplies `CurrentCartCookie` to `CurrentCart.layer`, and provides the resulting `CurrentCart` around the endpoint effect.

The pre-response handler applies the final pending change to the exact `cart` cookie through the immutable `HttpServerResponse`. It runs for successful and mapped error responses, preserving the existing rule that a successfully created Cart ID remains set even if a later add-item write fails.

Next Server Components and Server Actions provide the same `CurrentCart` Service per invocation. `nextCurrentCartLayer(locale)` keeps its boundary helper private, reads authentication, Store context, and `cookies()` once while building the boundary Layer, supplies `set` through the captured cookie store, and treats stale-cookie `clear` as best-effort because Server Components cannot mutate cookies. Callers provide that Layer once around a concrete `CurrentCart` method and never receive `CurrentCartCookie`. Request-specific Layers or service values are constructed inside the request and are never memoized as module-level runtime Layers.

Use an explicit request-local `Ref` only for the pending HTTP `cart` cookie change. Do not use `FiberRef`, `Context.Reference`, or Effect `Scope`: Current Cart is an explicit dependency, the pending cookie is shared request state, and cookie/header access has no acquire/release lifecycle.

### Anonymous lifecycle

- The request boundary resolves Store context from the trusted locale and decodes the existing `cart` cookie only when its currency, locale, and Store key match that context.
- Effect HTTP may retain the supported `x-context-anonymous-cart-id` possession input for non-browser/mobile/test callers. A verified authenticated principal takes precedence; otherwise a matching cookie takes precedence over the header.
- No cookie or header is a valid anonymous pre-Cart state. The request still has an anonymous `CommerceContext`, whose principal has no Cart ID; it is not `noPrincipal` and does not fail Current Cart resolution.
- Read-only use cases report that no Current Cart exists when there is no anonymous Cart ID. Checkout maps that absence to Checkout unavailable because Checkout requires an existing non-empty Cart.
- A create-capable buyer intent such as add item creates a Store-scoped anonymous Cart when no Current Cart exists, sets the new Cart ID immediately after successful creation, and then continues the requested mutation.
- A confirmed missing or no-longer-current anonymous Cart may be cleared and treated as absent. Create-capable intent can then create and set a replacement.
- Network, provider, decoding, or authorization failures are not absence. They return typed failures and must never create another Cart, overwrite `cart`, or clear a valid cookie.
- The cookie codec and behavior remain transport-owned: cookie name `cart`; context-bound Cart id, currency, locale, and Store key; HTTP-only; secure in production; SameSite `lax`; path `/`; 90-day maximum age.

### Authenticated B2B lifecycle

- Verified authentication takes precedence over anonymous possession for Current Cart selection.
- The request boundary supplies verified Auth User ID, Store, and an optional Business Unit ID selector. `CommerceContext` derives Customer ID and obtains Store-scoped memberships through `CommerceAccounts`; it validates an explicit selector or infers the sole membership. Missing, unrecognized, or ambiguous commerce identity fails with a typed context error rather than falling back to an anonymous Cart.
- `CurrentCart` selects exactly one active Cart through the verified Customer associate, Business Unit, and Store context. Zero active Carts is absence; more than one is a typed conflict and is never resolved by picking the latest result.
- A create-capable buyer intent may create a new Cart already scoped to the verified Store and Business Unit when no active Cart exists. It does not write the anonymous `cart` cookie.
- Read-only Checkout maps B2B Cart absence to Checkout unavailable. It never creates a Cart merely by being opened.

### Sign-in, identity, and authority

- Anonymous and B2B Carts remain separate. Sign-in does not merge, transfer, delete, or clear the anonymous `cart` cookie.
- While authenticated, `CurrentCart` uses the B2B Cart and ignores the anonymous Cart ID. If the buyer later signs out, the still-valid cookie can identify the Current Cart again.
- Cart ids supplied in forms, headers outside the supported possession boundary, or mutation payloads never grant Cart authority. Buyer-facing `CurrentCart` operations act on the request-bound Current Cart.
- Provider resource versions do not cross the `CurrentCart` Service. `Carts` and its concrete Layer own provider revision and concurrency mechanics.
