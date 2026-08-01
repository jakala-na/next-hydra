# Implementation-ready Current Cart specification

Type: grilling
Status: resolved
Blocked by: 02, 03, 04, 05, 06, 07

## Question

Turn the resolved Current Cart decisions into an implementation-ready specification and smallest coherent incremental commit sequence.

Each commit must leave one reviewable architecture, preserve working behavior, include behavior-focused tests at the Effect Service seams, and name its validation gates. Confirm that the superseded Checkout seed remains a pointer to this canonical map and that no competing implementation path remains in the tracker.

## Answer

The implementation-ready specification is [Current Cart Service and Provider Layers](../spec.md).

It consolidates the resolved lifecycle, Service contracts, schema-backed Cart model, typed failures, request-bound composition, Commercetools conflict behavior, caller compatibility, test Layers, acceptance criteria, and exact validation gates into six coherent commits:

1. define the provider-neutral Cart Services and memory contract;
2. move Commercetools persistence behind `Carts`;
3. provide `CurrentCart` per request;
4. migrate the complete Storefront Cart slice;
5. migrate `CheckoutSession`, web Checkout, and Checkout HTTP atomically;
6. delete the legacy seam and run the final search, test, typecheck, lint, and build gates.

The specification makes Cart-target pinning explicit so Checkout identity validation and the following mutation cannot drift to another Current Cart during one use-case program. The pinned target is provider-neutral and contains no resource revision.

The former Checkout ticket `Effect Cart operations and Commercetools custom-fields writer` remains `wontfix` and points to this map. Its provisional Cart Operations name and mandatory generic custom-fields writer are superseded. No other open Current Cart ticket or competing implementation plan remains in `.scratch/`.
