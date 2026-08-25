# Checkout Effect Slice PRD

Status: historical implementation plan

## Problem Statement

The commerce module needs a first Checkout implementation that can support B2B checkout behavior without committing to a hosted checkout or a custom one-pass checkout flow. Hosted checkout is not flexible enough for this template because B2B buyers may need invoice terms, store credit, cart and checkout policies, buyer-specific context, address-dependent product restrictions, and checkout experiences that vary by buyer mode.

The existing commerce code has Cart, Cart Policy, product, store, and provider-facing Commercetools modules, but Checkout is not yet a domain module. The next slice should adopt the repository's Effect architecture direction while leaving existing Cart behavior intact. Checkout should derive progress from the current Cart, buyer context, and Checkout Details, save checkout details through explicit Checkout Mutations, and expose a lean Checkout State that the UI can render.

## Solution

Build a first Checkout domain slice as an Effect-first module. The slice starts with a kernel tracer that names `CheckoutSession` as the public Checkout Service and capability, `CheckoutSession.getCurrent` as the first use-case program, its Commercetools layer, the storefront Checkout Scope, the schema-backed `CartForCheckout` projection, and the current checkout read path. The broader slice introduces Contact and Delivery Details mutations and normalized Checkout Violations.

Checkout State is not stored. It is recomputed from the current Cart, buyer context, Checkout Details, and policy results. The first slice supports a checkout page with a main step area and a cart sidebar. It starts with Contact and Delivery Details as the first actionable steps, while preserving the step sequence needed for Shipping Options, Payment Options, and Review Order.

Contact resolves how the buyer is known for Checkout. Delivery Details resolves the Shipping Address. Checkout Mutations save details onto the Cart or provider-backed cart representation. Mutations return structured failures for schema, source, provider, and version conflict errors. After a successful save, application adapters can revalidate or rerun `CheckoutSession.getCurrent` rather than requiring the mutation to return a recomputed Checkout State.

Checkout behavior should live outside the HTTP boundary. Server components, server actions, and HTTP handlers should all run `CheckoutSession` through a reusable checkout runtime layer. The HTTP API is one adapter over that capability, not the owner of checkout behavior. Each HTTP endpoint should resolve or receive Checkout Scope, run one Checkout use-case program, and map typed errors to transport responses.

## User Stories

1. As a buyer, I want to open Checkout only when I have an existing non-empty Cart, so that checkout always starts from products I intend to buy.
2. As a buyer, I want Checkout to show one active step at a time, so that I know what information I need to provide next.
3. As a buyer, I want completed steps to collapse, so that I can focus on the first incomplete step.
4. As a buyer, I want earlier completed steps to become incomplete again if their underlying details stop satisfying current rules, so that Checkout does not rely on stale completion flags.
5. As a buyer, I want Contact to be skipped when all required Contact details are already available to Checkout, so that I avoid redundant confirmation.
6. As a buyer, I want Contact to open when required Contact details are missing, so that I can provide the information needed to continue.
7. As a guest buyer, I want to enter Buyer Contact manually, so that the order can be associated with an email address and name.
8. As an authenticated buyer, I want Checkout to derive Buyer Contact from my customer profile when allowed, so that I can proceed without retyping known information.
9. As an authenticated buyer, I want Checkout to save customer-profile contact details onto the Cart when the provider requires cart-level contact fields, so that downstream provider behavior is consistent.
10. As an authenticated buyer, I want Checkout to allow manual Buyer Contact only when the store permits it, so that B2B rules can prevent unsupported overrides.
11. As an authenticated buyer, I want Checkout to reject disallowed manual Contact saves immediately, so that invalid contact details are not written to the Cart.
12. As an authenticated buyer, I want previously saved Contact details to be re-evaluated against current Contact Source Policy, so that old carts follow current checkout rules without migration.
13. As a B2B buyer, I want authenticated Checkout Scope to require the current Buying Context, so that Checkout selects the Cart belonging to the correct Store and Business Unit.
14. As a B2B buyer, I want authenticated Checkout to use the Cart for my current Store and Buying Context while leaving any anonymous Cart untouched, so that purchases do not cross ownership scopes.
15. As a B2B buyer, I want Buyer Contact to remain separate from authenticated identity, so that changing order communication details does not change who I am or which Buying Context I use.
16. As a buyer, I want Buyer Contact to require email address, first name, and last name, so that the order has usable communication details.
17. As a buyer, I want phone number to be optional in Contact, so that checkout does not require extra information before there is a business need.
18. As a buyer, I want Delivery Details to support manually entered Shipping Address, so that I can ship to a new destination.
19. As an authenticated buyer, I want Delivery Details to support selecting an Address Book Reference, so that I can reuse saved addresses.
20. As an authenticated buyer, I want Address Book saves to resolve the current canonical Shipping Address at save time, so that Checkout uses the provider's latest saved address data.
21. As a buyer, I want Delivery Details completion to rely on the resolved Shipping Address, so that Checkout still works with providers that write addresses onto the Cart rather than preserving address references.
22. As a buyer, I want a structurally valid Shipping Address to be saved even when it later triggers a policy violation, so that Checkout can show the next blocking constraint in context.
23. As a buyer, I want Checkout to show blocking violations after saving Delivery Details, so that I understand why Shipping Options cannot continue.
24. As a buyer, I want the cart sidebar to show cart-related Checkout Violations, so that I can see which products or cart combinations prevent checkout.
25. As a buyer, I want Checkout Violations to be global, so that non-step-bound problems can still block checkout clearly.
26. As a buyer, I want Checkout Violations to target the whole Cart, a cart item, or a Checkout Step when relevant, so that the UI can render the violation in the right place.
27. As a buyer, I want Checkout to treat all first-slice Checkout Violations as blocking, so that progression rules are predictable.
28. As a product engineer, I want Checkout State to be derived from Cart, buyer context, and Checkout Details, so that no persistent Checkout State needs to be migrated when rules change.
29. As a product engineer, I want Checkout Step status to be binary, so that the active step can always be derived as the first incomplete step.
30. As a product engineer, I want Checkout State to be a lean read model, so that it does not duplicate the full Cart or own option catalogs such as address book entries.
31. As a product engineer, I want option lists and resolver choices to come from separate capabilities, so that Checkout State only represents current saved or derived Checkout Details.
32. As a product engineer, I want Contact Source and Delivery Details Source to be input strategies, so that validation can branch without adding field-level provenance to domain contracts.
33. As a product engineer, I want schema failures and provider failures to be structured Checkout Mutation Failures, so that adapters and API clients can decide how to recover.
34. As a product engineer, I want version conflicts to be structured Checkout Version Conflicts, so that stale saves preserve newer Cart state.
35. As a product engineer, I want Checkout Mutations to be idempotent replacement-style operations, so that repeated saves preserve a single set of checkout details.
36. As a product engineer, I want Cart Policy Violations and Checkout Policy Violations normalized into Checkout Violations, so that the UI can render one global list without losing each violation's source.
37. As a product engineer, I want Cart Policy to remain about Cart data, so that rendering cart rules in Checkout keeps ownership clear.
38. As a product engineer, I want Checkout Policy to own rules that depend on checkout details, so that address-dependent restrictions are not forced into Cart Policy.
39. As a product engineer, I want Checkout Read Schema to represent ordinary incomplete checkout, so that normal checkout progress does not become an error path.
40. As a product engineer, I want Checkout Action Schemas to enforce details required by specific actions, so that action failures remain precise and structured.
41. As a product engineer, I want the first Checkout slice to follow the Effect architecture ADR, so that Checkout starts with the repository's target domain architecture.
42. As a product engineer, I want adapters such as server actions and route handlers to stay thin, so that domain logic remains in `CheckoutSession` use-case programs and Checkout state-building functions.
43. As an API client developer, I want to submit Contact and Delivery Details through structured APIs, so that non-Next.js clients can use the same checkout behavior.
44. As an API client developer, I want to decide whether to rerun Checkout State after a mutation, so that each client can choose its own loading and revalidation strategy.
45. As a future implementer, I want Payment Options and Review Order to be named in the step sequence but not implemented yet, so that the first slice does not block future checkout growth.

## Implementation Decisions

- Build Checkout as a new Effect-first domain slice aligned with ADR-0003.
- Use Effect terms precisely: Services are replaceable capabilities, Layers are implementations, and use-case programs are externally meaningful operations. In this slice, the `CheckoutSession` methods are the Checkout use-case programs.
- Name the public Checkout Service and capability `CheckoutSession`.
- `CheckoutSession` owns the use-case programs `getCurrent`, `saveContact`, and `saveDeliveryDetails`.
- Keep existing Cart behavior intact for the first slice. Checkout can introduce a small schema-backed `CartForCheckout` projection without reworking the full Cart module.
- Co-locate each Checkout Interface and Layer with the Module that owns it.
- Keep Contact and Delivery Details persistence inside the concrete `CheckoutSession` layer until a real second Adapter or proven complexity creates a separate Module.
- Commercetools persistence for Contact and Delivery Details belongs inside the Commercetools `CheckoutSession` layer.
- Model Checkout State as a derived read model, not a stored checkout aggregate.
- Require an existing non-empty Cart before Checkout can start. UI and adapters may redirect or recover when no active cart exists.
- Use `CheckoutSession.getCurrent` to get Checkout State from the current Cart, buyer context, Checkout Details, and policy results.
- Keep Checkout State construction in an internal `buildCheckoutState` function that `CheckoutSession.getCurrent` calls after resolving provider data.
- `buildCheckoutState` receives a resolved Checkout Scope, `CartForCheckout`, Checkout Details, buyer context, Cart Policy Violations, and Checkout Policy Violations. It validates that Checkout can start, computes step completion, computes the active step, normalizes violations, and returns Checkout State.
- `buildCheckoutState` is a Checkout state builder function, not a Service and not a use-case program.
- Keep provider Cart projection in `decodeCartForCheckout`; this is a schema-backed provider-boundary decoder/mapper called inside the `CheckoutSession` layer after Cart fetch.
- Define a storefront Checkout Scope value so HTTP handlers and Next.js server components/actions can resolve the current checkout context before running `CheckoutSession`.
- Treat `toCheckoutScope` as adapter input mapping for the first HTTP read adapter, not as a use-case program.
- Add a request-scoped `CurrentCheckoutScope` context Service when HTTP scope resolution moves into middleware. It should carry the already-resolved Checkout Scope for handlers and remain separate from the domain `CheckoutSession` capability.
- Add a `CheckoutScopeResolver` Service only if resolving Checkout Scope becomes pluggable behavior across cookies, headers, bearer JWTs, store context, or other adapter inputs.
- Server Components can construct Commerce Request Context or Checkout Scope directly when they already have trusted in-process context, then call `CheckoutSession.getCurrent` through the runtime layer.
- Start with storefront Checkout Scope for anonymous and customer checkout. Admin/support checkout can be designed later when that workflow is stable.
- Compose provider-specific Layers through a reusable checkout runtime layer that can be shared by HTTP adapters and in-process callers.
- Expose checkout behavior through the HTTP API incrementally as each behavior slice lands rather than deferring API clients to a final adapter pass.
- HTTP current-checkout endpoints should derive authorization and cart access from request context, not from trusting a submitted cart id as the security boundary.
- Use Commerce Request Context as the schema-backed adapter boundary value that combines resolved locale with a verified Commerce Principal before Checkout Scope is derived.
- Keep Commerce Principal as the verified request identity or possession value. It does not include locale.
- Use `x-context-anonymous-cart-id` for the first HTTP current-checkout read adapter when a test, mobile, or other non-browser client needs to pass the anonymous Cart ID explicitly.
- Treat HTTP APIs as public-facing adapters that authenticate or resolve their own request context. Do not assume only a trusted Next.js app can call them.
- Model request authentication as verified Commerce Principals, not trusted identity headers. Expected Checkout principals are anonymous and customer.
- For browser anonymous requests, resolve Anonymous Cart ID from a signed or HTTP-only cookie when available. Possession of the anonymous Cart token is acceptable only for anonymous Cart access.
- For browser anonymous requests, the anonymous cart cookie wins over `x-context-anonymous-cart-id` when both are present.
- For authenticated customer requests, use `Authorization: Bearer <jwt>` as the customer identity input. Checkout HTTP adapters validate issuer, audience, signature, expiry, and required scopes or claims, then extract verified `authUserId`.
- For the first request-context resolver pass, derive Commerce Customer ID from verified `authUserId -> CommerceAccount -> customerId` lookup. Customer ID claims can be added later only as a trusted optimization with explicit consistency rules.
- Do not trust caller-supplied `x-context-customer-id` as a public identity boundary. Remove it from the public checkout API contract and ignore it if a caller sends it anyway.
- Machine-to-machine callers are out of scope for Checkout because Checkout interactions are offered by a user. Machine Commerce Principals can be designed later for other commerce APIs when there is a concrete use case.
- Keep `x-context-*` headers as adapter context inputs, not domain authority. They are suitable for resolved locale and non-browser anonymous Cart possession, but security-sensitive identity must come from verified bearer JWTs or trusted in-process context.
- Invalid, expired, or malformed bearer JWTs should remain typed internal auth failures but map publicly to HTTP 404 with stable error code `checkout.notFound` for current-checkout reads.
- No valid customer JWT plus no anonymous cart possession should map to HTTP 404 with stable error code `checkout.notFound`.
- Valid customer JWT with no Commerce Customer ID mapping should remain a typed internal account-mapping failure but map publicly to HTTP 404 `checkout.notFound` for current-checkout reads.
- Future checkout mutation slices can define sharper write-specific auth/error mapping instead of inheriting the current-checkout read collapsing rule.
- Provider/runtime failures during JWT validation or Commerce Customer ID lookup should map externally to HTTP 500.
- Keep Checkout State lean. It reports current Checkout Details, binary step status, active step, and one global list of Checkout Violations.
- Keep unsaved option catalogs outside Checkout State. Address book entries, customer profile candidates, and similar choices come from separate resolver or option capabilities.
- Use Checkout Read Schema for ordinary incomplete checkout. It must decode incomplete Contact and incomplete Delivery Details.
- Use stricter Checkout Action Schemas for operations that require completed details.
- Use binary Checkout Step status: complete or incomplete.
- Derive the Active Checkout Step as the first incomplete step in the checkout step sequence.
- Represent blocking through global Checkout Violations while the active step remains incomplete. Step status stays binary.
- Use this step sequence as the first design: Contact, Delivery Details, Shipping Options, Payment Options, Review Order.
- Implement Contact and Delivery Details first. Shipping Options, Payment Options, and Review Order can exist as planned step identifiers without full behavior.
- Make Contact the step that establishes Buyer Contact and, when required, Buying Context.
- Require Buyer Contact details: email address, first name, and last name.
- Treat phone number as optional Buyer Contact.
- Keep Buying Context out of Contact Source. Buying Context may be required for authenticated B2B Checkout, but it is not a strategy for resolving Buyer Contact.
- Support Contact Source values Manual and Customer Profile in the first design.
- Use Manual as the Contact Source for buyer-entered Buyer Contact.
- Use Customer Profile as the Contact Source for Buyer Contact derived from the current customer profile.
- In the first slice, Contact Source resolves a complete Buyer Contact. Partial Contact overrides can be designed once there is a real workflow for them.
- Treat Contact Source as an input strategy, not field-level provenance.
- Allow authenticated buyers to save Buyer Contact details that differ from their profile when Manual is allowed.
- Saving Buyer Contact does not change the authenticated buyer or Buying Context.
- Saving Contact submits Contact Inputs needed to resolve Contact for the current Checkout.
- Saving Contact is a replacement-style Checkout Mutation and is allowed even when Contact is already complete.
- If Customer Profile is selected but cannot provide required Buyer Contact details, return a structured Checkout Mutation Failure.
- If the selected Contact Source is not allowed for the current Checkout, return a structured Checkout Mutation Failure.
- Re-evaluate previously saved Contact Source details against current Contact Source Policy. If they no longer satisfy Contact, Contact becomes incomplete.
- Represent Contact Source Policy results as Contact incompletion, not Checkout Policy Violations.
- Make Delivery Details the step that establishes Shipping Address.
- Support Delivery Details Source values Manual and Address Book in the first design.
- Use Manual as the Delivery Details Source for buyer-entered Shipping Address.
- Use Address Book as the Delivery Details Source for Shipping Address selected from saved addresses.
- For Address Book saves, submit an Address Book Reference and resolve the Shipping Address during the save operation.
- Delivery Details completion depends on the resolved Shipping Address, not on preserving an Address Book Reference.
- Save structurally valid Shipping Address details even if they later produce a Checkout Violation.
- If an Address Book Reference cannot resolve to a Shipping Address, return a structured Checkout Mutation Failure.
- Use structured Checkout Mutation Failures for schema validation failures, source eligibility failures, unresolved address references, provider failures, and version conflicts.
- Model version conflicts as Checkout Version Conflict failures handled by the provider capability.
- Checkout Mutations should save details and report success or structured failure.
- Next.js adapters can revalidate the checkout page after mutation so the page reruns `CheckoutSession.getCurrent`.
- API clients can rerun Checkout State after mutation when they need recomputed state.
- Keep Cart Policy and Checkout Policy distinct.
- Cart Policy evaluates Cart data and remains a Cart concept even when Checkout displays its violations.
- Checkout Policy evaluates checkout details plus Cart data or buyer context, such as address-dependent restrictions.
- Normalize Cart Policy Violations and Checkout Policy Violations into one global Checkout Violations list in Checkout State.
- Preserve each Checkout Violation source as Cart Policy or Checkout Policy.
- Treat all first-slice Checkout Violations as blocking. Warning and advisory severity can be introduced once there is a real use case.
- Allow Checkout Violations to target a Checkout Step, a cart item, or the whole Cart.
- Keep violation targeting optional because some rules are intentionally whole-cart or non-step-bound.
- The cart sidebar can render the same global Checkout Violations and decide how to display cart-item or whole-cart targets.
- Use deep modules where possible: `CheckoutSession`, `buildCheckoutState`, checkout mutation behavior, policy normalization, schema-backed Cart projection, reusable runtime-layer composition, and thin adapter modules.
- Add new replaceable capabilities when a slice has real behavior that needs them. Issue 01 names the CheckoutSession, CartForCheckout, state builder, runtime layer, and thin adapters.
- Keep provider-specific payloads and SDK details inside concrete provider layers.
- Keep server actions, route handlers, and UI entrypoints thin. They resolve adapter input, run one `CheckoutSession` use-case program, map errors, and revalidate or render.
- The first implementation should not rename existing Cart or Store Context services. New Checkout terms should use Checkout language, especially `CheckoutSession`, `Checkout Details`, and `CartForCheckout`.

## Testing Decisions

- Good tests should exercise external behavior at `CheckoutSession`, `buildCheckoutState`, and adapter interfaces, not private helper ordering or implementation details.
- Test `buildCheckoutState` as a deep state-builder function with in-memory Cart, buyer context, Checkout Details, and policy results.
- Test that incomplete Checkout decodes through the Checkout Read Schema.
- Test that the Active Checkout Step is the first incomplete step.
- Test that step status is binary and that policy blocking does not create a third step status.
- Test Contact completion for manual Buyer Contact, customer-profile Buyer Contact, missing required Buyer Contact details, authenticated B2B with Buying Context, and authenticated B2B without Buying Context.
- Test Contact Source Policy behavior where Manual is allowed, Manual is disallowed for a new save, and previously saved Manual no longer satisfies Contact.
- Test `saveContact` as a replacement-style mutation, including idempotent repeated saves.
- Test `saveContact` failures for invalid manual input, incomplete customer profile, disallowed source, provider failure, and version conflict.
- Test Delivery Details completion for manual Shipping Address and Address Book resolved Shipping Address.
- Test `saveDeliveryDetails` as a replacement-style mutation, including idempotent repeated saves.
- Test `saveDeliveryDetails` failures for invalid address input, stale or inaccessible Address Book Reference, provider failure, and version conflict.
- Test that structurally valid Shipping Address saves even when checkout policy later produces a violation.
- Test Checkout Violation normalization from Cart Policy and Checkout Policy into one global list.
- Test that each normalized Checkout Violation preserves its source.
- Test violation targets for whole Cart, cart item, and Checkout Step.
- Test that all first-slice Checkout Violations are treated as blocking.
- Test adapters lightly: decoding, mapping structured failures, invoking `CheckoutSession`, and triggering revalidation where applicable.
- Test request-context resolution so customer identity cannot be spoofed through `x-context-customer-id`.
- Test browser anonymous context resolution from cookie-backed Anonymous Cart ID.
- Test non-web customer context resolution from verified bearer JWT plus `authUserId -> CommerceAccount -> customerId` lookup.
- Test invalid JWT rejection as HTTP 404 `checkout.notFound` for `/checkout/current`.
- Test no valid JWT and no anonymous cart possession as HTTP 404 `checkout.notFound`.
- Test valid JWT with no Commerce Customer ID mapping as HTTP 404 `checkout.notFound` for `/checkout/current`.
- Test provider/runtime failures during JWT validation or Commerce Customer ID lookup as external HTTP 500.
- Test machine-to-machine Checkout requests as unsupported unless a later explicit use case introduces them.
- Use Effect-native tests and Layers for new Effect modules.
- Existing Cart Policy service tests and commerce provider tests provide prior art for policy behavior and provider adapter boundaries.
- Existing Registration Effect tests provide architectural prior art for testing use-case programs with memory layers.

## Out of Scope

- Building a complete custom checkout UI beyond the first Contact and Delivery Details slice.
- Hosted checkout integration.
- Payment Options implementation.
- Payment Method persistence.
- Shipping Options implementation.
- Shipping rate fetching or carrier selection.
- Review Order and place-order implementation.
- Order creation.
- Invoice terms, store credit, coupons, split payment behavior, and other payment-specific rules.
- Anonymous-to-B2B Cart transfer or merge; signing in leaves the Store-only anonymous Cart untouched.
- Full address book management UI.
- Customer profile management UI.
- Buying Context selection UI beyond noting that Contact may require it.
- Partial Contact overrides on Customer Profile source.
- Field-level provenance for Buyer Contact.
- Structured incompletion reasons in Checkout State.
- Warning/advisory Checkout Violation severity.
- Persisted Checkout State or a Checkout aggregate.
- Migrating existing carts when checkout rules change.
- Reworking the existing Cart module to Effect as part of this first slice.
- Renaming existing Cart or Store Context services.
- Admin/support checkout scope and APIs.
- Adding an option for mutations to return recomputed Checkout State.
- URL edit-step override behavior, except leaving the model compatible with it later.

## Further Notes

- This PRD follows the Checkout glossary captured in the commerce context documentation.
- The first practical implementation slice is the Checkout Effect kernel and current-state tracer.
- The read model should be useful both for a Next.js page that revalidates after server actions and for future API consumers that call read and mutation endpoints directly.
- The cart sidebar is conceptually part of the checkout experience because it renders the current Cart and global Checkout Violations.
- API adapter coverage should land with the relevant read or mutation slice instead of as one final adapter issue.
- Future HTTP mutation slices should depend on request-context resolution before trusting customer or Cart identity from adapter input.
