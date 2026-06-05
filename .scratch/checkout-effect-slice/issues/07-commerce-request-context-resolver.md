# Commerce Request Context resolver

Status: ready-for-agent
Type: AFK

## Parent

`.scratch/checkout-effect-slice/PRD.md`

## What to build

Add the request-context resolution slice that makes Checkout HTTP adapters stop treating caller-supplied identity headers as authority. Browser requests should resolve anonymous checkout from the anonymous cart cookie when possible. Authenticated customer requests should resolve customer identity from a verified auth/session token or account lookup. Non-web clients should use bearer JWTs with validated issuer, audience, signature, expiry, and required scopes or claims. Machine-to-machine callers should use service credentials with explicit scopes and must not gain arbitrary customer impersonation by submitting a customer ID.

This slice should provide resolved request context to checkout adapters so handlers can keep running one `CheckoutSession` use-case program. `CurrentCheckoutScope` remains checkout-specific request context. Any broader commerce principal or commerce request-context Service should be separate from the domain `CheckoutSession` capability.

## Acceptance criteria

- [ ] HTTP adapters resolve a verified commerce principal before building Checkout Scope.
- [ ] Supported principals are anonymous, customer, and machine.
- [ ] Browser anonymous requests resolve Anonymous Cart ID from the anonymous cart cookie when present.
- [ ] Possession of an Anonymous Cart token grants access only to that anonymous Cart flow.
- [ ] Authenticated customer requests resolve customer identity from verified auth/session context, not from `x-context-customer-id`.
- [ ] Authenticated customer context can derive Commerce Customer ID from verified claims or an `authUserId -> CommerceAccount -> customerId` lookup.
- [ ] Non-web customer clients can authenticate with bearer JWTs whose issuer, audience, signature, expiry, and required scopes or claims are validated.
- [ ] Machine-to-machine requests authenticate with service credentials or JWTs with explicit scopes.
- [ ] Machine tokens do not authorize arbitrary customer access by accepting a submitted customer ID.
- [ ] On-behalf-of customer access, if needed, is rejected unless a separate explicit authorization model is implemented.
- [ ] `x-context-locale` can remain a generic request-context input, or be replaced by route/locale middleware where available.
- [ ] `x-context-anonymous-cart-id` remains only a test/internal/non-cookie adapter fallback if still needed.
- [ ] Public HTTP adapters reject or ignore `x-context-customer-id` as an identity source.
- [ ] Checkout HTTP middleware provides `CurrentCheckoutScope` from resolved request context.
- [ ] Server Components and server actions can still construct Checkout Scope directly when they already have trusted in-process context.
- [ ] Tests prove customer identity cannot be spoofed through `x-context-customer-id`.
- [ ] Tests cover anonymous cookie resolution, missing anonymous context, valid customer JWT/session resolution, invalid JWT/session rejection, machine-token authorization, and rejected unauthorized on-behalf-of access.
- [ ] Relevant typecheck and test commands pass.

## Blocked by

- `.scratch/checkout-effect-slice/issues/01-checkout-effect-kernel-and-current-state-tracer.md`
