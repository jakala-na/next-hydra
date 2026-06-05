# Commerce Request Context resolver

Status: ready-for-agent
Type: AFK

## Parent

`.scratch/checkout-effect-slice/PRD.md`

## What to build

Add the request-context resolution slice that makes Checkout HTTP adapters stop treating caller-supplied identity headers as authority. Browser requests should resolve anonymous checkout from the anonymous cart cookie when possible. Authenticated customer requests should resolve customer identity from a verified bearer JWT and account lookup. Next.js browser/server callers should pass the verified user's JWT as `Authorization` rather than making checkout HTTP adapters repeat browser session lookup such as `getUser`. Non-web clients should also use bearer JWTs with validated issuer, audience, signature, expiry, and required scopes or claims. Machine-to-machine callers are out of scope for Checkout because Checkout interactions are offered by a user; machine Commerce Principals can be designed later for other commerce APIs when there is a concrete use case.

This slice should provide resolved request context to checkout adapters so handlers can keep running one `CheckoutSession` use-case program. `CurrentCheckoutScope` remains checkout-specific request context. Any broader Commerce Principal or commerce request-context Service should be separate from the domain `CheckoutSession` capability.

Resolver shape:

1. Decode request context inputs.
2. Resolve a trusted Commerce Principal.
3. Build schema-backed Commerce Request Context from resolved locale and Commerce Principal.
4. Derive Checkout Scope from Commerce Request Context.
5. Provide `CurrentCheckoutScope` to checkout HTTP handlers.

## Acceptance criteria

- [ ] HTTP adapters resolve a verified Commerce Principal before building Checkout Scope.
- [ ] Commerce Principal values crossing the resolver boundary are schema-backed.
- [ ] All identifiers crossing commerce resolver and capability boundaries are branded/schema-backed.
- [ ] First-pass Commerce Principal schemas include anonymous and customer variants only.
- [ ] Commerce Principal schemas do not include locale; locale remains separate resolved request context.
- [ ] Commerce Principal and Commerce Request Context schemas live together in `packages/commerce/domain/commerce-request-context.ts`.
- [ ] Define a commerce-local `AuthUserId` brand in `packages/commerce/domain/commerce-request-context.ts` rather than importing Registration identity types.
- [ ] Commerce Request Context is schema-backed and combines resolved locale with Commerce Principal.
- [ ] Checkout-specific mapping from Commerce Request Context to Checkout Scope stays outside `packages/commerce/domain/commerce-request-context.ts`.
- [ ] Checkout-specific mapping lives in `packages/commerce/lib/checkout/request-context.ts`.
- [ ] Checkout-specific mapping can be named `toCheckoutScope(context)` when the parameter is a schema-backed Commerce Request Context.
- [ ] Checkout HTTP middleware derives Checkout Scope only after Commerce Principal resolution.
- [ ] Resolver-level failures use typed request-context errors separate from `CheckoutUnavailable`.
- [ ] Request-context errors live with `CommerceRequestContext` in `packages/commerce/domain/commerce-request-context.ts`.
- [ ] Request-context not-found reasons include no principal before Checkout Scope exists.
- [ ] `CheckoutUnavailable` remains for failures after Checkout Scope exists, such as no cart, empty cart, or inaccessible cart.
- [ ] Supported Checkout principals are anonymous and customer.
- [ ] Browser anonymous requests resolve Anonymous Cart ID from the anonymous cart cookie when present.
- [ ] Anonymous browser cookie reading stays in the app/HTTP/Next adapter, not in commerce domain or checkout mapping code.
- [ ] Do not move existing anonymous cart cookie utilities in this slice; create the new resolver path and leave old paths for later cleanup.
- [ ] When a browser request includes both an anonymous cart cookie and `x-context-anonymous-cart-id`, the cookie wins.
- [ ] Possession of an Anonymous Cart token grants access only to that anonymous Cart flow.
- [ ] First-pass anonymous cart possession uses the existing `CartId` brand.
- [ ] The domain language remains possession-based so a future opaque or signed anonymous cart token can replace raw Cart ID without changing Checkout terms.
- [ ] When a request has both a validated customer JWT and anonymous cart possession, the customer JWT wins for Checkout Scope.
- [ ] Anonymous-to-customer cart merge is not part of this resolver slice.
- [ ] Authenticated customer requests resolve customer identity from a verified bearer JWT, not from `x-context-customer-id`.
- [ ] Authenticated checkout HTTP requests use `Authorization: Bearer <jwt>` as the customer identity input.
- [ ] Checkout HTTP adapters validate bearer JWT issuer, audience, signature, expiry, and required scopes or claims.
- [ ] Checkout HTTP adapters extract verified `authUserId` from the validated JWT rather than repeating browser session lookup such as `getUser`.
- [ ] JWT validation is implemented through the existing auth package boundary, such as `auth-workos` or `auth-clerk`, and can move behind a future auth domain abstraction without changing checkout domain behavior.
- [ ] Invalid, expired, or malformed `Authorization` is a typed internal auth failure and does not fall back to anonymous checkout even when anonymous cart possession is present.
- [ ] Public `/checkout/current` read responses collapse invalid, expired, or malformed bearer JWT failures to HTTP 404 with stable error code `checkout.notFound`.
- [ ] First-pass authenticated customer context derives Commerce Customer ID from verified `authUserId -> CommerceAccount -> customerId` lookup.
- [ ] First-pass customer lookup extends the existing `CommerceAccounts` capability rather than introducing a new provider port.
- [ ] The `CommerceAccounts` auth-user lookup accepts branded commerce-local `AuthUserId`, not plain `string`.
- [ ] The `CommerceAccounts` auth-user lookup returns only `CommerceCustomerId` for this slice because request-context resolution only needs Customer ID.
- [ ] Name the lookup `CommerceAccounts.getCustomerIdByAuthUserId(authUserId)`.
- [ ] Capability methods should return the data each step needs rather than broader records.
- [ ] Valid customer JWT with no Commerce Customer ID for `authUserId` is a typed internal account-mapping failure.
- [ ] Public `/checkout/current` read responses collapse missing Commerce Customer ID mapping to HTTP 404 with stable error code `checkout.notFound`.
- [ ] The `checkout.notFound` auth/context collapsing rule is scoped to current-checkout reads; future checkout mutation slices can define sharper write-specific auth/error mapping.
- [ ] Provider/runtime failures during JWT validation or Commerce Customer ID lookup still map externally to HTTP 500.
- [ ] Customer ID claims can be added later as an optimization only after issuer, audience, scope, and account-consistency rules are defined.
- [ ] Non-web customer clients use the same bearer JWT authentication path.
- [ ] Machine-to-machine Checkout requests are rejected or treated as unsupported.
- [ ] On-behalf-of customer Checkout access is rejected unless a separate explicit authorization model is implemented in a later slice.
- [ ] `x-context-locale` remains the explicit resolved-locale input for checkout HTTP adapters.
- [ ] Rename raw HTTP header schema from `CommerceContextHeaders` to `CheckoutRequestHeaders`.
- [ ] `CheckoutRequestHeaders` includes `x-context-locale` and optional `x-context-anonymous-cart-id`.
- [ ] `CheckoutRequestHeaders` does not include `x-context-customer-id`.
- [ ] `Authorization` is handled as a separate standard auth input, not as part of `CheckoutRequestHeaders`.
- [ ] Next.js/i18n adapters derive locale once from route prefixes, locale cookies, browser fallback, or other web rules, then pass the resolved locale to checkout HTTP adapters.
- [ ] Checkout HTTP adapters do not duplicate Next.js/i18n locale negotiation logic.
- [ ] `x-context-anonymous-cart-id` remains a non-browser/test anonymous cart possession input for clients such as mobile apps that cannot conveniently use cookie storage.
- [ ] `x-context-anonymous-cart-id` is never a browser override for the anonymous cart cookie.
- [ ] `x-context-customer-id` is removed from the public checkout API contract because caller-supplied customer identity cannot be trusted.
- [ ] Public HTTP adapters ignore `x-context-customer-id` if a caller sends it anyway.
- [ ] Requests with no valid customer JWT and no anonymous cart possession return a typed not-found error.
- [ ] The no-current-checkout response uses HTTP 404 with stable error code `checkout.notFound` plus explanatory message.
- [ ] Checkout HTTP middleware provides `CurrentCheckoutScope` from resolved request context.
- [ ] Direct in-process callers such as Server Components and server actions can construct Checkout Scope or Commerce Request Context themselves when they already have trusted context.
- [ ] Direct callers that are still crossing an adapter/request boundary should prefer Commerce Request Context plus `toCheckoutScope`.
- [ ] Direct callers may construct Checkout Scope directly when they already know the checkout target.
- [ ] Existing checkout Server Component page uses schema-backed Commerce Request Context plus `toCheckoutScope` for its locale and anonymous cart cookie mapping.
- [ ] Tests prove customer identity cannot be spoofed through `x-context-customer-id`.
- [ ] Tests cover anonymous cookie resolution, missing anonymous context, valid customer JWT resolution, invalid JWT rejection, unsupported machine-to-machine Checkout access, and rejected unauthorized on-behalf-of access.
- [ ] Relevant typecheck and test commands pass.

## Blocked by

- `.scratch/checkout-effect-slice/issues/01-checkout-effect-kernel-and-current-state-tracer.md`
