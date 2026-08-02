# Effect request context and Current Cart association

## Recommendation

For Effect HTTP APIs, the request middleware should provide **`CurrentCart` itself** to endpoint handlers. `CurrentCart` remains a provider-neutral `Context.Service`; its live Layer depends on the provider-neutral `Carts` Service plus an internal request-bound `CurrentCartSession` Service/value. The middleware creates that session once per request, then provides `CurrentCart.layer` around the handler. Endpoint code never receives cookies, headers, Cart IDs from arbitrary inputs, or a passive scope value.

`CurrentCartSession` should be a discriminated value with behavior:

- anonymous: resolved Store context and optional valid possessed Cart ID in `CommerceContext`, plus cookie `set` / `clear` effects;
- authenticated B2B: resolved Store, Customer, and Business Unit Buying Context, with no anonymous-association commands.

The concrete anonymous implementation belongs at the transport boundary. It decodes the existing `cart` cookie and headers when the middleware starts, but exposes only provider-neutral session facts and association commands to `CurrentCart`.

```text
HttpServerRequest (headers + cookies)
  -> CurrentCart middleware
       -> resolve CurrentCartSession
       -> allocate Ref<Option<AnonymousCartCookieChange>>
       -> register pre-response handler
       -> provide CurrentCartSession
       -> provide CurrentCart.layer (depends on CurrentCartSession + Carts)
  -> endpoint uses only CurrentCart
  -> pre-response handler applies the final Set-Cookie change
```

This follows the Effect service guidance: use `Context.Service` for the contract, capture dependencies while building its Layer, keep service methods free of environment requirements, and provide the dependency graph at the boundary.

## Why a request-local `Ref` and pre-response handler

Use a fresh `Ref<Option<AnonymousCartCookieChange>>` for every request. `set` and `clear` update that Ref; one pre-response handler reads its final value and immutably adds or expires the cookie on the outgoing `HttpServerResponse`.

`Ref` is the correct state primitive: it is an explicit, atomically updated mutable reference (`Ref.ts:42-47`), and `make`, `get`, and `set` are ordinary Effects (`Ref.ts:179-199`, `Ref.ts:228-231`). Last-write-wins is useful if orchestration replaces or clears an association during one request, and parallel child fibers still share the same explicit Ref.

Effect Platform already defines the response hook. `HttpEffect.appendPreResponseHandler` registers a callback against the current request (`HttpEffect.ts:181-202`), and the server invokes it for both successful and failed handler exits before sending the response (`HttpEffect.ts:55-75`, `HttpEffect.ts:79-91`). `HttpApiBuilder.securitySetCookie` is the primary in-tree example: it registers a pre-response handler and calls `Response.setCookie` (`HttpApiBuilder.ts:480-500`). `HttpServerResponse.setCookie` validates the cookie and returns a new response containing the updated immutable cookie collection (`HttpServerResponse.ts:570-609`); `expireCookie` is the matching clear operation (`HttpServerResponse.ts:611-647`).

Registering the hook when middleware starts is preferable to having `CurrentCart` construct a response or return a cookie instruction. It keeps transport mechanics out of the domain Service while ensuring a successfully created anonymous Cart can be associated even if a later Cart operation returns a typed failure. The exact commit-on-error policy should be stated in the later lifecycle decision; Effect's hook will run on error responses unless deliberately conditioned.

## Middleware composition

`HttpApiMiddleware.Service` explicitly models middleware-provided and middleware-required Services. Its type machinery removes `provides` and adds `requires` to the handler environment (`HttpApiMiddleware.ts:185-207`), while `Service` is itself a `Context.Service` declaration (`HttpApiMiddleware.ts:278-320`). Therefore the Cart middleware should declare approximately:

- `provides: CurrentCart`;
- `requires: Carts` plus the Services required to resolve verified Customer, Business Unit, and Store context;
- a typed request-context error.

Internally it should resolve the request, create the pending-change Ref and `CurrentCartSession`, then provide the session and `CurrentCart.layer` around `httpEffect`. The current Checkout middleware already demonstrates the per-request `Effect.provideService` shape, but exposes only `CurrentCheckoutScope` (`packages/commerce/http/checkout-api.ts:118-140`, `apps/api/lib/checkout/http.ts:438-449`). The replacement should raise that boundary to the application capability callers actually use.

Effect's request is already a request-scoped Service whose immutable value includes headers and parsed cookies (`HttpServerRequest.ts:62-106`). The existing API manually reads `x-context-locale`, `x-context-anonymous-cart-id`, and the `cart` cookie from it (`apps/api/lib/checkout/http.ts:117-140`). That transport parsing belongs in the new middleware, not in `CurrentCart` or `Carts`.

## Layer and Scope choices

- **`Layer.succeed`** is appropriate for the stateless middleware implementation itself, as in the existing Checkout middleware.
- **`Layer.effect`** is appropriate for `CurrentCart.layer`, because it obtains `Carts` and `CurrentCartSession` and returns the orchestrating Service. In Effect v4, `Layer.effect` is the scoped Layer constructor and replaces Effect 3's `Layer.scoped`; it runs acquisition in the Layer's Scope (`Layer.ts:837-888`).
- The `CurrentCart` Layer must be provided inside the request middleware, after the request-specific session is available. It must not be constructed once in a process-wide application Layer with request data captured in it.
- **Effect `Scope` is not request context.** A Scope tracks resource finalizers and closes them (`Scope.ts:51-80`). Cookie/header access has no acquire/release lifecycle, so `Layer.scoped`/Scope adds no useful ownership semantics here. The HTTP server already owns the request lifetime.
- **`Effect.provideService`** is correct for installing the already-resolved request session around one handler; it removes that Service from the wrapped effect's requirements (`Effect.ts:5774-5790`). `provideServiceEffect` is an alternative when resolution itself should be expressed as acquisition (`Effect.ts:5792-5855`), but the middleware generator is clearer because it also allocates the Ref and registers the response hook.

## Why not FiberRef / Context.Reference

Do not hide the Current Cart session or pending cookie mutation in a FiberRef. It is a real application dependency, so a `Context.Service` makes it visible in the environment and replaceable in tests. A Fiber-local value also has fork/inheritance semantics that are the wrong ownership model for a mutation shared by all work in one HTTP request; the explicit request-local Ref has unambiguous shared-state semantics.

This repository uses Effect 4.0.0-beta.67 (`pnpm-workspace.yaml:4-13`). The local Effect v4 source exposes dynamic runtime defaults as `Context.Reference`, described as Service keys with cached default values (`Context.ts:273-305`), rather than a public `FiberRef` module. A Cart association has no sensible global default and must not be silently available outside a request, so `Context.Reference` is also the wrong model.

## Next.js Server Components and Server Actions

Next is a second transport implementation of the same internal `CurrentCartSession` contract:

- At each Server Component or Server Action entry point, resolve auth, Store context, headers, and `cookies()` once, create the session value, then provide it while providing `CurrentCart.layer` to the program.
- In a Server Action, anonymous `set` and `clear` directly call the captured Next cookie store's `set` / `delete`; there is no `HttpServerResponse` or Effect pre-response hook to modify.
- Server Components should use the read path only. Do not attempt response-cookie writes during rendering; creation/mutation belongs in Server Actions. A read-only Next session implementation should fail with a typed boundary error if a write is accidentally invoked, rather than silently doing nothing.

The existing cookie module proves both sides of this transport implementation: it reads through `cookies().get`, writes through `cookies().set`, and clears through `cookies().delete` (`packages/commerce/lib/cart/utils/anonymous-cart-cookies.ts:110-143`). The current `addToCart` Server Action is the sole production caller that creates a Cart and then writes the association (`packages/commerce/actions/add-to-cart.ts:15-42`). The new boundary moves that write behind the session Service while preserving the exact cookie codec and options: name `cart`, context-bound payload, HTTP-only, secure in production, SameSite `lax`, path `/`, and 90-day max age (`anonymous-cart-cookies.ts:11-21`, `anonymous-cart-cookies.ts:45-62`, `anonymous-cart-cookies.ts:102-108`).

## Source paths

Effect source citations are relative to:

`~/.local/share/effect-solutions/effect/packages/effect/src/`

Relevant files:

- `Layer.ts`
- `Effect.ts`
- `Scope.ts`
- `Ref.ts`
- `Context.ts`
- `unstable/http/HttpEffect.ts`
- `unstable/http/HttpServerRequest.ts`
- `unstable/http/HttpServerResponse.ts`
- `unstable/httpapi/HttpApiBuilder.ts`
- `unstable/httpapi/HttpApiMiddleware.ts`
