# Effect Layer composition and Cart caller migration

Type: grilling
Status: resolved
Blocked by: 01, 03, 04, 05, 06

## Question

Define how the process-level runtime provides `Carts` while Effect HTTP middleware and Next request entry points provide `CurrentCart` per request, then map every existing Cart caller onto the new Effect programs without permanent parallel abstractions.

Cover web layout reads, request-local anonymous cookie association, Server Actions, CheckoutSession, HTTP middleware and pre-response handling, runtime Layers, Cart Policy evaluation, test Layers, public payload compatibility, error mapping, cache and revalidation behavior, and deletion of superseded Cart service/repository paths and tests. Keep provider choice in Layer composition rather than per-call branching.

## Answer

The application chooses the commerce provider once through Layer composition. `Carts` and other process-level Services are supplied by the application runtime; every Next or Effect HTTP request constructs a fresh `CurrentCart` Layer from verified request facts and provides it lexically around the buyer-facing program. No caller branches on provider identity and no request-specific Layer is memoized globally.

```text
application composition
  layerCommercetoolsCarts ─┐
  CartPolicies.layer       ├─ process-level commerce runtime
  CommerceAccounts Layer   │
  AddressBook Layer        │
  CheckoutPolicies.layer  ─┘
               │
request boundary
  auth + locale + Store + cookie/header + Buying Context
               │
  fresh CurrentCartRequest + association Ref/effect
               │
       CurrentCart.layer
          │           │
  storefront programs CheckoutSession.layer
```

### Process-level composition

`layerCommercetoolsCarts` supplies `Carts` at the same application-owned composition root that supplies the Commercetools `CommerceAccounts` and `AddressBook` Layers. `CartPolicies.layer` and `CheckoutPolicies.layer` remain provider-neutral. A future provider replaces `layerCommercetoolsCarts` at this root; neither `CurrentCart`, `CheckoutSession`, nor a caller contains a provider switch.

The web application owns a module-level Effect runtime for these process Services. It may use `ManagedRuntime` so Layer construction and resource finalization remain Effect-owned. Programs run by that runtime still construct and provide a fresh request Layer inside each Next invocation. The API route continues constructing its handler once from an application Layer, which gives Effect HTTP the same process-level Services.

`CheckoutSession.layer` becomes provider-neutral. It depends on `CurrentCart`, `CheckoutPolicies`, `CommerceAccounts`, and `AddressBook`; it no longer closes over `cartService` or contains a Commercetools implementation. `layerCommercetoolsCheckoutSession` and `checkoutRuntimeLayerCommercetools` are deleted. The application composition supplies `CheckoutSession.layer` above the request-bound `CurrentCart` Service and the process Services it needs.

### Request-bound composition

One shared request-resolution module produces the private `CurrentCartRequest` value established in [Current Cart scope and lifecycle](02-current-cart-scope-and-lifecycle.md). Web and API entry points use the same rules for authenticated precedence, Store resolution, Business Unit Buying Context, and context-bound anonymous possession.

For Next Server Components and Server Actions, an app-owned runner:

1. resolves authentication, locale, Store, Business Unit context, and the `cart` cookie once;
2. constructs the private request value and a fresh `CurrentCart.layer`;
3. provides that Layer around an Effect program requiring `CurrentCart`;
4. runs the remaining process requirements with the web commerce runtime.

Server Components receive a read-only association implementation. An accidental create or clear attempt fails as `CurrentCartAssociationFailure`. Server Actions capture the request's mutable cookie store and implement association changes through its `set` and `delete` operations. A successful anonymous creation writes the exact `cart` cookie before `addItem` continues, so a later add failure does not orphan the created Cart.

Effect HTTP replaces the current Checkout-scope-only middleware with request middleware that also provides `CurrentCart`. The middleware reads `HttpServerRequest`, creates one request-local `Ref` for a pending anonymous association change, registers an `HttpEffect.appendPreResponseHandler`, and provides the resulting `CurrentCart` around the endpoint effect. The hook applies the final pending change with `HttpServerResponse.setCookieUnsafe` or its checked equivalent. Because the hook runs for both successful and mapped error responses, association survives a later failure. Existing API-only context needed by Checkout and Address Book handlers may remain request-provided, but it is derived alongside `CurrentCart`; it does not select Cart persistence independently.

### Existing caller migration

#### Storefront layout and CartProvider

`apps/web/app/[locale]/layout.tsx` starts `CurrentCart.get()` through the read-only request runner and continues passing the unresolved promise into the existing Suspense boundary. `Option.none` becomes the UI's ordinary no-Cart value; typed provider, selection, policy, or context failures are logged and shielded rather than converted into absence inside `CurrentCart`.

The layout now follows the same authenticated-precedence rule as every other Current Cart caller. An authenticated B2B buyer sees the Store and Business Unit Current Cart; the ignored anonymous association remains intact for a later signed-out request.

`CartProvider` and its action contracts migrate atomically from provider-shaped `CartWithIssues` to `CurrentCartState`. They read `violations`, use `CartSnapshot.lineItems[].variant`, and obtain currency from semantic Cart money rather than a duplicate top-level currency. The current loading, flyout, toast, local-state replacement, and Suspense behavior remains unchanged.

#### Storefront Server Actions

The exported `addToCart`, `changeCartItemsQuantity`, and `removeCartItem` action names and buyer-intent inputs remain stable. Their bodies become small Effect boundaries:

- `addToCart` calls `CurrentCart.addItem`; it no longer reads, creates, cookies, writes, and evaluates policies itself;
- `changeCartItemsQuantity` calls `CurrentCart.setLineItemQuantity` with a positive absolute quantity;
- `removeCartItem` calls `CurrentCart.removeLineItem`.

Every successful action maps the returned `CurrentCartState` into the existing `next-safe-action` success envelope so the client can replace local state immediately. Typed failures remain shielded behind the existing generic Cart UI errors, but diagnostic provider, association, selection, conflict, and unknown-outcome failures are logged with their operation. `CartWriteOutcomeUnknown` is never automatically retried by the action.

No Cart cache tag is introduced. Current Cart depends on request identity and cookies and remains a dynamic request read. Storefront mutations continue updating `CartProvider` from the returned state rather than forcing route revalidation.

#### CheckoutSession and web Checkout

`CheckoutSession.getCurrent` calls `CurrentCart.get`, maps absence or an empty Cart to `CheckoutUnavailable`, consumes the already-evaluated Cart Policy violations, and evaluates only Checkout Policies itself. It no longer accepts Cart scope as authority for persistence or calls the provider Cart seam.

Contact and Delivery Details orchestration stays in `CheckoutSession`: resolve allowed sources, Customer Profile or Address Book data, normalize canonical input, compare the submitted expected Cart identity with the authoritative Current Cart, call `CurrentCart.saveContact` or `CurrentCart.saveDeliveryDetails`, and build fresh Checkout State from the returned Current Cart state. The successful HTTP mutation path does not perform a second Current Cart read.

Next Checkout page and Server Action entry points use the same request runner as the layout. Forms retain hidden Cart identity for `CheckoutCartMismatch`, but remove hidden `cartVersion`. Successful Contact and Delivery Details actions continue revalidating `/{locale}/checkout`; mismatch, exhausted conflict, and the existing partial Address Book failure cases keep their current revalidation behavior. No broader layout revalidation is added.

#### Checkout HTTP

All Checkout handlers consume the middleware-provided `CurrentCart` through `CheckoutSession`. The current cookie-over-header anonymous precedence and authenticated bearer precedence stay at the HTTP boundary. `x-context-anonymous-cart-id` remains a supported transport possession input and never becomes a `CurrentCart` method parameter.

HTTP status shielding and stable codes remain unchanged: bad input is 400, unavailable Checkout is 404, mismatch and exhausted write conflict are 409, and provider/internal failures are 500. Internal `CartWriteConflict` continues mapping to the public code `checkout.versionConflict`; the provider version is not returned.

The deliberate wire change is removal of Cart `version` from `CheckoutApiState`, `CheckoutCartReference`, Contact and Delivery Details request payloads, web forms, fixtures, and contract tests. The current submitted version is ignored by live writes, so no compatibility field or opaque replacement survives. Cart identity remains required for stale-form detection. The OpenAPI description and consumers update in the same commit.

### Error ownership

`CurrentCart` owns selection, association, Cart persistence, and Cart Policy failure translation. Storefront action boundaries map those failures into their current generic `ActionResult` presentation. `CheckoutSession` maps Current Cart absence/inaccessibility into Checkout semantics, retains `CheckoutCartMismatch`, and carries partial Address Book references on Delivery Details failures. Web actions and HTTP handlers perform only their transport-specific status, message, logging, and revalidation mapping.

Provider failures are never treated as missing Current Cart. Association write failures are observable typed failures even when provider Cart creation succeeded. Public payloads never serialize internal causes, Commercetools errors, provider revisions, or update actions.

### Test composition

Tests exercise real Service orchestration through Layers rather than mocking the removed module singleton:

- the provider-neutral `Carts` contract suite runs against a fresh `Carts.layerMemory(seed)` and, where environment-backed integration tests are available, `layerCommercetoolsCarts`;
- focused Commercetools tests cover decoding, scoped endpoints, Custom Type behavior, and concurrency recovery without putting those mechanics in the memory Layer;
- `CurrentCart` tests compose `CurrentCart.layer`, `Carts.layerMemory`, `CartPolicies` test Layers, and private anonymous or B2B request values, including pending association behavior;
- storefront action tests are added for missing reads, anonymous creation and cookie association, authenticated B2B selection, fresh mutation state, typed failure shielding, and unknown add outcome;
- CheckoutSession tests use the real provider-neutral `CheckoutSession.layer` with `CurrentCart`, `CommerceAccounts`, `AddressBook`, and policy test Layers instead of duplicating Checkout behavior in `CheckoutSession.layerMemoryFrom`;
- HTTP route tests provide the complete test Layer and verify cookie/header/auth precedence, pre-response cookie writes on success and mapped failure, unchanged status codes, and version-free schemas;
- Next boundary tests keep the cookie codec and exact cookie options covered separately from Current Cart orchestration.

`CheckoutSession.layerMemoryFrom` is removed once these composed test Layers cover its scenarios. Test-only `Layer.succeed` values remain appropriate for forcing a narrow typed failure, but production Services do not gain test-control methods.

### Incremental commit sequence

Each commit keeps one provider implementation and leaves the branch runnable:

1. **Define the provider-neutral Cart capability.** Add `CartSnapshot`, typed failures, `Carts`, `CartPolicies`, `CurrentCart`, and fresh memory/test Layers with contract tests; no caller changes yet.
2. **Move Commercetools persistence behind `Carts`.** Refactor the existing GraphQL/SDK functions into `layerCommercetoolsCarts`, add focused decoding/concurrency tests, and let the temporary old exports delegate to the same private implementation so provider behavior is not duplicated.
3. **Add request-bound Current Cart composition.** Implement `CurrentCart.layer`, the private request value, shared request resolution, Next read/write runners, and Effect HTTP association middleware with lifecycle tests; callers still use the old seam.
4. **Migrate the storefront slice atomically.** Switch the locale layout, all three Cart Server Actions, action contracts, and `CartProvider` to `CurrentCartState`; remove `getCartForContext`, direct policy evaluation, and storefront cookie orchestration.
5. **Migrate Checkout atomically.** Make `CheckoutSession.layer` depend on `CurrentCart`, switch web page/actions and all HTTP handlers/runtime composition, return mutation-derived Checkout State, remove Cart versions from forms and HTTP schemas, and preserve external status/error mappings and revalidation behavior.
6. **Delete the superseded seam.** Remove `cart.service.ts`, the temporary `cartRepo` facade and provider-shaped Cart service/repository types, `layerCommercetoolsCheckoutSession`, `checkoutRuntimeLayerCommercetools`, obsolete projection/action helpers, `CheckoutSession.layerMemoryFrom`, module-mocking tests, and stale documentation. Keep only cookie codecs/options in the transport boundary and provider mechanics under `layerCommercetoolsCarts`.
7. **Validate the complete replacement.** Run contract, Current Cart, storefront action, CheckoutSession, HTTP route, cookie, typecheck, lint, and build checks; verify searches find no caller imports of the deleted seam, provider version outside the Commercetools Layer, or direct Cart Policy evaluation outside `CurrentCart`.

The temporary delegating exports in the second and third commits are migration scaffolding only. They are deleted by the same planned sequence and never become a second long-lived Cart abstraction.
