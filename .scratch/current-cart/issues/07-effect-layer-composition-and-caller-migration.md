# Effect Layer composition and Cart caller migration

Type: grilling
Status: resolved
Blocked by: 01, 03, 04, 05, 06

## Question

Define how the process-level runtime provides `Carts` while Effect HTTP middleware and Next request entry points provide `CurrentCart` per request, then map every existing Cart caller onto the new Effect programs without permanent parallel abstractions.

Cover web layout reads, request-local anonymous `cart` cookie handling, Server Actions, CheckoutSession, HTTP middleware and pre-response handling, runtime Layers, Cart Policy evaluation, test Layers, public payload compatibility, error mapping, cache and revalidation behavior, and deletion of superseded Cart service/repository paths and tests. Keep provider choice in Layer composition rather than per-call branching.

## Answer

The application chooses the commerce provider once through Layer composition. `Carts` and other process-level Services are supplied by the application runtime; every Next or Effect HTTP request constructs a fresh `CurrentCart` Layer from verified request facts and provides it lexically around the buyer-facing program. No caller branches on provider identity and no request-specific Layer is memoized globally.

```text
application composition
  layerCommercetoolsCarts ─┐
  CartPolicies.layer       ├─ process-level commerce runtime
  CommerceAccounts Layer   │
  CheckoutPolicies.layer  ─┘
  AddressBook Layer recipe ─ provider choice
               │
request boundary
  verified auth + Store + cookie/header + optional Business Unit selector
               │
  CommerceContextRequest + CurrentCartCookie(set/clear)
               │
  CommerceContext.layer resolves Customer + Business Unit membership
               │
  CurrentCart.layer + AddressBook Layer
          │              │
  storefront programs    CheckoutSession.layer
```

### Process-level composition

`layerCommercetoolsCarts` supplies `Carts` at the application-owned composition root beside the Commercetools `CommerceAccounts` Layer. The application also selects `layerCommercetoolsAddressBook`, whose Layer recipe is built only after the request provides `CommerceContext`. `CartPolicies.layer` and `CheckoutPolicies.layer` remain provider-neutral. A future provider replaces those provider Layers at this root; neither `CurrentCart`, `CheckoutSession`, nor a caller contains a provider switch.

The web application composes process Services with request-specific Layers at each Next entry point. It does not introduce a generic Effect runner. Each Server Component or Server Action executes one concrete Effect, provides one locale-based Layer at that boundary, and calls `Effect.runPromise` only to bridge the Effect into Next's Promise contract. The API route continues constructing its handler once from an application Layer, which gives Effect HTTP the same process-level Services.

`CommerceContext.layer(request)` provides the verified Store and principal once for the request. It derives Customer ID from verified Auth User ID, asks `CommerceAccounts` for Store-scoped Business Unit memberships, validates an explicit Business Unit selector or infers the sole membership, and owns Customer Profile access. `CommerceAccounts` reports provider-backed mappings and memberships but does not choose the current Buying Context. The selected `AddressBook` Layer depends on `CommerceContext` and exposes `list`, `get`, and `save` without identity parameters; there is no parallel `CurrentAddressBook` Service. `CheckoutSession.layer` depends on `CommerceContext`, derives `CheckoutScope` once, and depends on `CurrentCart`, `AddressBook`, and `CheckoutPolicies`; it no longer calls `CommerceAccounts` directly. Its methods accept only operation-specific input. `layerCommercetoolsCheckoutSession` and `checkoutRuntimeLayerCommercetools` are deleted.

### Request-bound composition

Each transport boundary centralizes its own native request access while producing the same two inputs: `CommerceContextRequest` for Store and buyer selectors, and `CurrentCartCookie` for anonymous `set`/`clear`. Web and API entry points use the same rules for authenticated precedence, Store resolution, Business Unit selection, and context-bound anonymous possession without introducing a generic Effect runner or cross-transport request abstraction.

For Next Server Components and Server Actions, the locale-based boundary Layer:

1. reads authentication, locale, Store, an optional Business Unit selector, and the `cart` cookie once;
2. constructs `CommerceContextRequest`, `CurrentCartCookie`, and a fresh `CurrentCart.layer`;
3. provides `CommerceContext.layer(request)`, which resolves Customer and Business Unit membership, then constructs the selected `AddressBook` Layer and `CheckoutSession.layer`;
4. provides the complete Layer once around a concrete Service method at the Next entry point.

`nextCurrentCartLayer(locale)` and `nextCheckoutLayer(locale)` own the private boundary helper, which reads the captured cookie store once and supplies `CurrentCartCookie`. A failed `set` is `CurrentCartOperationFailure`; stale-cookie clearing cannot fail a Server Component read. A successful anonymous creation writes the exact `cart` cookie before `addItem` continues, so a later add failure does not orphan the created Cart. No Next caller receives `CurrentCartCookie` or manually derives `CheckoutScope`.

The Business Unit switcher presents the provider-neutral Business Unit Label returned by `CommerceAccounts`, submits only its Business Unit ID, and stores that ID in the `business-unit-id` cookie. The switch remains available during Checkout. Setting the cookie in its Server Action causes Next to rerender the current page and layouts on the server, so the new request resolves that Buying Context's Current Cart: another active Cart yields its Checkout and no active Cart yields Checkout absence. A technical Business Unit key is never presentation text or cookie authority.

Effect HTTP replaces the current Checkout-scope-only middleware with `CheckoutSessionMiddleware`. The middleware reads `HttpServerRequest`, creates one request-local `Ref` for the pending `cart` cookie change, registers an `HttpEffect.appendPreResponseHandler`, provides `CommerceContext`, then builds and provides `AddressBook` plus `CheckoutSession` around the endpoint effect. `CheckoutSession` privately consumes the request-bound `CurrentCart`. The hook applies the final pending cookie change with `HttpServerResponse.setCookieUnsafe` or its checked equivalent. Because the hook runs for both successful and mapped error responses, the Cart ID remains set after a later failure. Handlers use decoded endpoint headers for locale-specific response mapping; they do not receive separate Checkout context or scope Services.

### Existing caller migration

#### Storefront layout and CartProvider

`apps/web/app/[locale]/layout.tsx` provides `nextCurrentCartLayer(locale)` directly around `CurrentCart.get()` and continues passing the unresolved promise into the existing Suspense boundary. The private request is created inside the Layer. `Option.none` becomes the UI's ordinary no-Cart value; typed provider, selection, policy, or context failures are logged and shielded rather than converted into absence inside `CurrentCart`.

The layout now follows the same authenticated-precedence rule as every other Current Cart caller. An authenticated B2B buyer sees the Store and Business Unit Current Cart; the ignored anonymous `cart` cookie remains intact for a later signed-out request.

`CartProvider` and its action contracts migrate atomically from provider-shaped `CartWithIssues` to `CurrentCartState`. They read `violations`, use `CartSnapshot.lineItems[].variant`, and obtain currency from semantic Cart money rather than a duplicate top-level currency. The current loading, flyout, toast, local-state replacement, and Suspense behavior remains unchanged.

#### Storefront Server Actions

The exported `addToCart`, `changeCartItemsQuantity`, and `removeCartItem` action names and buyer-intent inputs remain stable. Their bodies become small Effect boundaries:

- `addToCart` calls `CurrentCart.addItem`; it no longer reads, creates, cookies, writes, and evaluates policies itself;
- `changeCartItemsQuantity` calls `CurrentCart.setLineItemQuantity` with a positive absolute quantity;
- `removeCartItem` calls `CurrentCart.removeLineItem`.

Every successful action maps the returned `CurrentCartState` into the existing `next-safe-action` success envelope so the client can replace local state immediately. Typed failures remain shielded behind the existing generic Cart UI errors, but diagnostic provider, Current Cart operation, selection, conflict, and unknown-outcome failures are logged with their operation. `CartWriteOutcomeUnknown` is never automatically retried by the action.

No Cart cache tag is introduced. Current Cart depends on request identity and cookies and remains a dynamic request read. Storefront mutations continue updating `CartProvider` from the returned state rather than forcing route revalidation.

#### CheckoutSession and web Checkout

`CheckoutSession.getCurrent()` calls `CurrentCart.get()`, maps absence or an empty Cart to `CheckoutUnavailable`, consumes the already-evaluated Cart Policy violations, and evaluates only Checkout Policies itself. `CheckoutSession.layer` obtains `CommerceContext` and derives scope once; `getCurrent`, `saveContact`, and `saveDeliveryDetails` do not accept either value and never call the provider Cart seam.

Contact and Delivery Details orchestration stays in `CheckoutSession`: resolve allowed sources, obtain Customer Profile data through `CommerceContext`, resolve Address Book Delivery Details through `AddressBook`, normalize canonical input, compare the submitted expected Cart identity with the authoritative Current Cart, call `CurrentCart.saveContact` or `CurrentCart.saveDeliveryDetails`, and build fresh Checkout State from the returned Current Cart state. Address Book catalog loading remains a separate `AddressBook.list()` call. The successful HTTP mutation path does not perform a second Current Cart read.

Next Checkout page and Server Action entry points provide `nextCheckoutLayer(locale)` once around direct Service methods. The Layer privately resolves the request, provides `CommerceContext`, and constructs `CurrentCart`, the selected `AddressBook`, and `CheckoutSession`. The page loads saved choices through `AddressBook.list()` only for authenticated customer Checkout; Server Actions call only `CheckoutSession`. FormData decoding and action-state mapping remain in the Next Server Action; the pass-through `saveCheckoutContactForScope` and `saveCheckoutDeliveryDetailsForContext` programs are deleted. Forms retain hidden Cart identity for `CheckoutCartMismatch`, but remove hidden `cartVersion`. Successful Contact and Delivery Details actions continue revalidating `/{locale}/checkout`; mismatch, exhausted conflict, and the existing partial Address Book failure cases keep their current revalidation behavior. No broader layout revalidation is added.

#### Checkout HTTP

Checkout handlers consume the request-bound `CurrentCart` only through `CheckoutSession`; `GET /address-book` consumes `AddressBook`. Middleware constructs a valid `CommerceContextRequest`, provides `CommerceContext`, and constructs both dependent Layers. Anonymous Address Book access maps the existing `CommerceRequestContextNotFound(noPrincipal)` to Checkout not found, while provider access denial retains its public bad-request mapping. Handlers use validated endpoint headers for locale mapping and pass neither scope nor context to Service methods. The current cookie-over-header anonymous precedence and authenticated bearer precedence stay at the HTTP boundary. `x-context-anonymous-cart-id` remains a supported transport possession input and never becomes a `CurrentCart` method parameter.

HTTP status shielding and stable codes remain unchanged: bad input is 400, unavailable Checkout is 404, mismatch and exhausted write conflict are 409, and provider/internal failures are 500. Internal `CartWriteConflict` continues mapping to the public code `checkout.versionConflict`; the provider version is not returned.

The deliberate wire change is removal of Cart `version` from `CheckoutApiState`, `CheckoutCartReference`, Contact and Delivery Details request payloads, web forms, fixtures, and contract tests. The current submitted version is ignored by live writes, so no compatibility field or opaque replacement survives. Cart identity remains required for stale-form detection. The OpenAPI description and consumers update in the same commit.

### Error ownership

`CurrentCart` owns resolution, anonymous Cart ID set/clear, Cart persistence, and Cart Policy failure translation. Storefront action boundaries map those failures into their current generic `ActionResult` presentation. `CheckoutSession` maps Current Cart absence/inaccessibility into Checkout semantics, retains `CheckoutCartMismatch`, and carries partial Address Book references on Delivery Details failures. Web actions and HTTP handlers perform only their transport-specific status, message, logging, and revalidation mapping.

Provider failures are never treated as missing Current Cart. A `set` failure is an observable `CurrentCartOperationFailure` even when provider Cart creation succeeded. Public payloads never serialize internal causes, Commercetools errors, provider revisions, or update actions.

### Test composition

Tests exercise real Service orchestration through Layers rather than mocking the removed module singleton:

- the provider-neutral `Carts` contract suite runs against a fresh `Carts.layerMemory(seed)` and, where environment-backed integration tests are available, `layerCommercetoolsCarts`;
- focused Commercetools tests cover decoding, scoped endpoints, Custom Type behavior, and concurrency recovery without putting those mechanics in the memory Layer;
- `CurrentCart` tests compose `CurrentCart.layer`, `Carts.layerMemory`, `CartPolicies`, `CommerceContext`, and the private cookie seam, including anonymous set/clear and authenticated no-op behavior;
- storefront action tests are added for missing reads, anonymous creation and cookie setting, authenticated B2B selection, fresh mutation state, typed failure shielding, and unknown add outcome;
- CommerceContext tests exercise current-customer/profile access and anonymous no-principal behavior; AddressBook tests exercise identity-free `list`, `get`, and `save` through a context-provided Layer;
- CheckoutSession tests use the real provider-neutral `CheckoutSession.layer` with `CommerceContext`, `CurrentCart`, `AddressBook`, and policy test Layers instead of duplicating Checkout behavior in `CheckoutSession.layerMemoryFrom`;
- HTTP route tests provide the complete test Layer and verify cookie/header/auth precedence, pre-response cookie writes on success and mapped failure, unchanged status codes, and version-free schemas;
- Next boundary tests keep the cookie codec and exact cookie options covered separately from Current Cart orchestration.

`CheckoutSession.layerMemoryFrom` is removed once these composed test Layers cover its scenarios. Test-only `Layer.succeed` values remain appropriate for forcing a narrow typed failure, but production Services do not gain test-control methods.

### Incremental commit sequence

Each commit keeps one provider implementation and leaves the branch runnable:

1. **Define the provider-neutral Cart capability.** Add `CartSnapshot`, typed failures, `Carts`, `CartPolicies`, `CurrentCart`, and fresh memory/test Layers with contract tests; no caller changes yet.
2. **Move Commercetools persistence behind `Carts`.** Refactor the existing GraphQL/SDK functions into `layerCommercetoolsCarts`, add focused decoding/concurrency tests, and let the temporary old exports delegate to the same private implementation so provider behavior is not duplicated.
3. **Add request-bound Current Cart composition.** Implement `CommerceContext.layer`, `CurrentCart.layer`, the private Next boundary helper behind locale-based Layers, and Effect HTTP cart-cookie handling with lifecycle tests; callers still use the old seam.
4. **Migrate the storefront slice atomically.** Switch the locale layout, all three Cart Server Actions, action contracts, and `CartProvider` to `CurrentCartState`; remove `getCartForContext`, direct policy evaluation, and storefront cookie orchestration.
5. **Migrate Checkout atomically.** Provide request-scoped `CommerceContext`, make the selected `AddressBook` Layer and `CheckoutSession.layer` depend on it, switch web page/actions and all HTTP handlers/runtime composition to direct Service methods, return mutation-derived Checkout State, remove Cart versions from forms and HTTP schemas, and preserve external status/error mappings and revalidation behavior.
6. **Delete the superseded seam.** Remove `cart.service.ts`, the temporary `cartRepo` facade and provider-shaped Cart service/repository types, `layerCommercetoolsCheckoutSession`, `checkoutRuntimeLayerCommercetools`, obsolete projection/action helpers, `CheckoutSession.layerMemoryFrom`, module-mocking tests, and stale documentation. Keep only cookie codecs/options in the transport boundary and provider mechanics under `layerCommercetoolsCarts`.
7. **Validate the complete replacement.** Run contract, Current Cart, storefront action, CheckoutSession, HTTP route, cookie, typecheck, lint, and build checks; verify searches find no caller imports of the deleted seam, provider version outside the Commercetools Layer, or direct Cart Policy evaluation outside `CurrentCart`.

The temporary delegating exports in the second and third commits are migration scaffolding only. They are deleted by the same planned sequence and never become a second long-lived Cart abstraction.
