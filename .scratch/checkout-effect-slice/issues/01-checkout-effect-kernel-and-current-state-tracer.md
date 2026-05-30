# Checkout Effect kernel and current-state tracer

Status: ready-for-agent
Type: AFK

## Parent

`.scratch/checkout-effect-slice/PRD.md`

## What to build

Build the first Checkout kernel tracer as an Effect-first domain slice. A buyer with an existing non-empty Cart should be able to reach a minimal checkout page shell by running a `getCheckoutState` program through the same runtime layer that can later be used by server components, server actions, admin tools, and HTTP handlers.

This slice should establish the names and boundaries future checkout issues copy: adapter-neutral Checkout Scope, domain schemas, service tags, provider layers, program entrypoints, reusable checkout runtime layer, and a thin HTTP API read adapter. The HTTP boundary is not the owner of checkout behavior; it exposes the same program that in-process Next.js and admin callers can run directly.

## Acceptance criteria

- [ ] Checkout defines an adapter-neutral Checkout Scope for storefront anonymous, storefront customer, and admin-targeted checkout access.
- [ ] Checkout Scope lets adapters derive the current checkout from request/session/admin context without requiring a customer Commercetools token exchange.
- [ ] Checkout defines domain schemas for Checkout State, Checkout Step, Checkout Facts, Checkout Violation, and structured Checkout Mutation Failures.
- [ ] Checkout defines service tags for the needed capabilities, including cart-backed checkout facts, store context, customer account facts, address book resolution, cart policies, and checkout policies.
- [ ] Checkout defines provider layer names for the first concrete Commercetools-backed capabilities without renaming existing pluralized services.
- [ ] Checkout defines program entrypoints for `getCheckoutState`, `saveCheckoutContact`, and `saveCheckoutDeliveryDetails`; only `getCheckoutState` needs full behavior in this slice.
- [ ] `getCheckoutState` derives Checkout State from the current Cart, buyer facts, cart-backed Checkout Facts, and policy results.
- [ ] Checkout requires an existing non-empty Cart before the checkout experience renders.
- [ ] Checkout State is derived and not persisted.
- [ ] Checkout State uses the planned step sequence: Contact, Delivery Details, Shipping Options, Payment Options, Review Order.
- [ ] Checkout Step status is binary: complete or incomplete.
- [ ] Active Checkout Step is derived as the first incomplete step.
- [ ] Checkout Read Schema can represent ordinary incomplete Checkout without failing decoding.
- [ ] Checkout State reports current Checkout Facts, step status, active step, and an empty or populated global violations list.
- [ ] Checkout State does not include unsaved option catalogs such as address book entries or customer profile candidates.
- [ ] A reusable checkout runtime layer composes the checkout programs with provider capabilities.
- [ ] The HTTP API exposes a current checkout read path that decodes request context, resolves Checkout Scope, runs `getCheckoutState`, and maps structured failures.
- [ ] The checkout page shell uses the same program through an in-process runtime path instead of calling the HTTP API from the same backend.
- [ ] The checkout page shell renders the active step area and cart sidebar from Checkout State.
- [ ] The cart sidebar renders the current Cart without duplicating cart ownership in Checkout.
- [ ] Tests cover incomplete Checkout decoding, active-step derivation, binary step status, non-empty Cart requirement, runtime-layer composition, direct program usage, and HTTP read adapter behavior.
- [ ] Relevant typecheck and test commands pass.

## Blocked by

None - can start immediately

