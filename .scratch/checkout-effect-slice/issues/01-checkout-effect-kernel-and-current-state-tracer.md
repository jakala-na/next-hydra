# Checkout Effect kernel and current-state tracer

Status: complete
Type: AFK

## Parent

`.scratch/checkout-effect-slice/PRD.md`

## What to build

Build the first Checkout kernel tracer as an Effect-first domain slice. A buyer with an existing non-empty Cart should be able to reach a minimal checkout page shell by running the `CheckoutSession.getCurrent` use-case program through the same runtime layer that can later be used by server components, server actions, and HTTP handlers.

This slice should establish the names and boundaries future checkout issues copy: storefront Checkout Scope, domain schemas, `CheckoutSession`, `buildCheckoutState`, schema-backed `CartForCheckout`, Commercetools layer, reusable checkout runtime layer, and a thin HTTP API read adapter. The HTTP boundary is not the owner of checkout behavior; it resolves adapter input, runs the same `CheckoutSession` use-case program that in-process Next.js callers can run directly, and maps typed errors to transport responses.

## Acceptance criteria

- [x] Checkout defines a storefront Checkout Scope for storefront anonymous and storefront customer checkout access.
- [x] Checkout Scope lets adapters derive the current checkout from request/session context without requiring a customer Commercetools token exchange.
- [x] Checkout defines domain schemas for Checkout State, Checkout Step, Checkout Details, Checkout Violation, and structured Checkout Mutation Failures.
- [x] Checkout defines a public `CheckoutSession` capability with `getCurrent`, `saveContact`, and `saveDeliveryDetails`.
- [x] Checkout treats `CheckoutSession` methods as use-case programs and keeps implementation helpers out of that terminology.
- [x] Checkout co-locates Interfaces and Layers with their owning Modules.
- [x] Checkout defines a schema-backed `CartForCheckout` projection for the Cart fields needed by checkout.
- [x] Checkout keeps provider Cart projection in `decodeCartForCheckout` as a schema-backed decoder/mapper inside the provider/cart boundary.
- [x] Checkout defines the first concrete Commercetools-backed `CheckoutSession` layer without renaming existing Cart or Store Context services.
- [x] Only `CheckoutSession.getCurrent` needs full behavior in this slice; save methods may return structured unsupported failures until their slices land.
- [x] `CheckoutSession.getCurrent` resolves the current Cart, buyer context, Checkout Details, and policy results, then calls `buildCheckoutState` before returning.
- [x] `buildCheckoutState` receives resolved checkout inputs, validates Checkout can start, computes step completion, computes the Next Checkout Step, normalizes violations, and returns Checkout State.
- [x] `buildCheckoutState` is documented as a state-builder function, not a Service or use-case program.
- [x] Checkout requires an existing non-empty Cart before the checkout experience renders.
- [x] Checkout State is derived and not persisted.
- [x] Checkout State uses the planned step sequence: Contact, Delivery Details, Shipping Options, Payment Options, Review Order.
- [x] Checkout Step status is binary: complete or incomplete.
- [x] Next Checkout Step is derived as the first incomplete step.
- [x] Checkout Read Schema can represent ordinary incomplete Checkout without failing decoding.
- [x] Checkout State reports current Checkout Details, step status, the Next Checkout Step, and an empty or populated global violations list.
- [x] Checkout State stays lean: option catalogs such as address book entries or customer profile candidates come from separate resolver or option capabilities.
- [x] A reusable checkout runtime layer composes `CheckoutSession` with provider layers.
- [x] The HTTP API exposes a current checkout read path that resolves adapter input to Checkout Scope, runs `CheckoutSession.getCurrent`, and maps structured failures.
- [x] Checkout documents `toCheckoutScope` as adapter input mapping, not a use-case program.
- [x] Checkout leaves room for HTTP middleware to provide request-scoped `CurrentCheckoutScope` once headers, cookies, auth session, or store context need shared resolution.
- [x] Checkout documents `CurrentCheckoutScope` as request-scoped context, separate from the domain `CheckoutSession` capability.
- [x] The HTTP API uses `x-context-anonymous-cart-id` when an anonymous Cart ID must be supplied explicitly.
- [x] The checkout page shell uses `CheckoutSession` through an in-process runtime path instead of calling the HTTP API from the same backend.
- [x] The checkout page shell renders the currently presented step and cart sidebar from Checkout State.
- [x] The cart sidebar renders the current Cart without duplicating cart ownership in Checkout.
- [x] Tests cover incomplete Checkout decoding, Next Checkout Step calculation, binary step status, non-empty Cart requirement, runtime-layer composition, direct use-case program usage, and HTTP read adapter behavior.
- [x] Relevant typecheck and test commands pass.

## Blocked by

None - can start immediately
