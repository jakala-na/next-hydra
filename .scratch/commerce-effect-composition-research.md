# Commerce Effect composition: `provide`, `ManagedRuntime`, and `Next.make`

Date: 2026-08-14

## Executive conclusion

The current `CommerceApp.provide(request, program)` is not a foreign inversion of control. Its implementation is exactly `program.pipe(Effect.provide(requestLayer))`, so it is already ordinary Effect composition. The awkwardness is the API shape and, more importantly, the fact that one closed request layer currently contains both stable provider construction and request-specific services.

The cleaner Effect model has two explicit seams:

1. A data-last request provision function transforms an Effect into another Effect:

   ```ts
   CommerceApp.provide(request)(program)
   // equivalent to:
   program.pipe(Effect.provide(CommerceRequestLive(request)))
   ```

2. A runtime runner terminates the Effect only at a JavaScript boundary:

   ```ts
   CommerceRuntime.runPromise(
     CommerceApp.provide(request)(program)
   )
   ```

`ManagedRuntime` should contain only stable application/provider services. Locale, auth/session, cookies, current-cart selection, `CommerceContext`, `CurrentCart`, `AddressBook`, and `CheckoutSession` are request-specific and must still be provided for each invocation.

For Next Server Actions and Server Components, a module-level Commerce runtime plus a small `build` or `runPromise` adapter is the right boundary. For Effect HTTP, do not start a nested ManagedRuntime inside middleware: provide the request layer as an Effect, and let `HttpRouter.toWebHandler` own and cache the outer application layer.

## What the three API shapes actually mean

| API | Result | Responsibility | Appropriate location |
| --- | --- | --- | --- |
| `CommerceApp.provide(request, program)` | `Effect` | Custom request-layer provision | Anywhere inside Effect composition |
| `program.pipe(Effect.provide(layer))` | `Effect` | Native Effect dependency provision | Preferred underlying primitive and public pipeable shape |
| `ManagedRuntime.runPromise(program)` | `Promise` | Runs an Effect using a lazily built, cached Context | JavaScript/framework edge only |
| `Next.make(...).build(handler)` | Next-compatible async function | Combines a ManagedRuntime, per-call middleware, and terminal execution | Next pages/layouts/components/actions/routes |

Effect's own guidance says to compose a single application layer and provide it once at the application entry point. `Effect.provide` is dual, so both data-first and data-last forms are supported; the pipeable form is idiomatic because the program stays visually primary. See the local Effect Solutions `services-and-layers` guide and the Effect v4 [`Effect.provide` declaration and example](https://github.com/Effect-TS/effect-smol/blob/6f38f07d5941a211b251383aaab0f4f55e8a6557/packages/effect/src/Effect.ts#L5438-L5518).

`ManagedRuntime` is a different operation, not an alternative spelling of `Effect.provide`. Effect describes it as a reusable runtime that builds a Layer lazily, caches its Context across executions, owns the resource scope, and exposes runners for JavaScript integration. Its runner methods are explicitly boundary operations. See [`ManagedRuntime.ts`](https://github.com/Effect-TS/effect-smol/blob/6f38f07d5941a211b251383aaab0f4f55e8a6557/packages/effect/src/ManagedRuntime.ts#L1-L29), the [runner interface](https://github.com/Effect-TS/effect-smol/blob/6f38f07d5941a211b251383aaab0f4f55e8a6557/packages/effect/src/ManagedRuntime.ts#L83-L164), and the [implementation that caches and reuses Context](https://github.com/Effect-TS/effect-smol/blob/6f38f07d5941a211b251383aaab0f4f55e8a6557/packages/effect/src/ManagedRuntime.ts#L223-L325).

The official Effect v4 integration example uses exactly this split for an external web framework: one exported runtime is shared by handlers, and each handler passes its domain Effect to `runtime.runPromise`. See [`ai-docs/src/03_integration/10_managed-runtime.ts`](https://github.com/Effect-TS/effect-smol/blob/6f38f07d5941a211b251383aaab0f4f55e8a6557/ai-docs/src/03_integration/10_managed-runtime.ts#L60-L89).

## What `effect-nextjs` teaches us

At current `main` commit `784093caf5abd1ca2e48c558ca70ea0493c07d8b`, `Next.make(tag, layer)` literally calls `ManagedRuntime.make(layer)`. `Next.makeWithRuntime` accepts an already-created runtime. See [`src/Next.ts`](https://github.com/mcrovero/effect-nextjs/blob/784093caf5abd1ca2e48c558ca70ea0493c07d8b/src/Next.ts#L175-L212).

`build(handler)` then returns an async Next-compatible function. On each call it creates the handler Effect, applies the configured middleware chain, and executes the final Effect through that runtime. See [`Next.build`](https://github.com/mcrovero/effect-nextjs/blob/784093caf5abd1ca2e48c558ca70ea0493c07d8b/src/Next.ts#L98-L150) and [`executeWithRuntime`](https://github.com/mcrovero/effect-nextjs/blob/784093caf5abd1ca2e48c558ca70ea0493c07d8b/src/internal/executor.ts#L1-L28).

Its action example therefore has this call stack:

```text
Next action arguments
  -> Effect-returning Action function
  -> request middleware
  -> middleware provides CurrentUser to Action
  -> ManagedRuntime.runPromiseExit(final Effect)
  -> Promise returned to Next
```

See [`example/Action.ts`](https://github.com/mcrovero/effect-nextjs/blob/784093caf5abd1ca2e48c558ca70ea0493c07d8b/example/Action.ts#L1-L37). Non-wrapping middleware uses `Effect.provideServiceEffect` to compute and provide one per-invocation service around the handler Effect; it is not placed in the long-lived runtime Context. See [`middleware-chain.ts`](https://github.com/mcrovero/effect-nextjs/blob/784093caf5abd1ca2e48c558ca70ea0493c07d8b/src/internal/middleware-chain.ts#L8-L38). This mirrors Effect v4's documented `Effect.provideServiceEffect`: acquire one service effectfully, remove that requirement from the wrapped program, and leave the remaining requirements for later provision ([source](https://github.com/Effect-TS/effect-smol/blob/6f38f07d5941a211b251383aaab0f4f55e8a6557/packages/effect/src/Effect.ts#L5792-L5855)).

The library's strongest lesson is not its fluent syntax. It is the division of ownership:

- `Next.make` / `makeWithRuntime` owns stable service runtime and terminal execution.
- Middleware runs for every invocation and supplies request values.
- The handler remains an ordinary Effect that declares its requirements.

The README itself recommends defining the wrapper once in `lib/runtime.ts` and reusing `.build(...)` at entry points ([README](https://github.com/mcrovero/effect-nextjs/blob/784093caf5abd1ca2e48c558ca70ea0493c07d8b/README.md#L34-L59)). Calling `Next.make` separately in every action file would create separate ManagedRuntime objects, so the reusable base-wrapper pattern matters more than the one-file action example.

### What it does not solve

- The action input in `example/Action.ts` is only TypeScript-typed; it is not decoded with Schema. The library documents Schema decoding for route/search params separately, but the action wrapper does not automatically validate arbitrary action input ([Action example](https://github.com/mcrovero/effect-nextjs/blob/784093caf5abd1ca2e48c558ca70ea0493c07d8b/example/Action.ts#L27-L37), [params guidance](https://github.com/mcrovero/effect-nextjs/blob/784093caf5abd1ca2e48c558ca70ea0493c07d8b/README.md#L190-L214)).
- Middleware `failure`, `catches`, and `returns` schemas drive types/metadata; the middleware chain does not decode domain failures with them. Unhandled failures reach the executor, which converts the Cause to a thrown JavaScript error. Domain-to-action and domain-to-HTTP error mapping still belongs in our boundary code ([`NextMiddleware.Tag`](https://github.com/mcrovero/effect-nextjs/blob/784093caf5abd1ca2e48c558ca70ea0493c07d8b/src/NextMiddleware.ts#L180-L236), [`executor.ts`](https://github.com/mcrovero/effect-nextjs/blob/784093caf5abd1ca2e48c558ca70ea0493c07d8b/src/internal/executor.ts#L8-L30)).
- Direct adoption is not currently available: the package declares `effect >=3.20.0 <4`, while this repository uses Effect v4 beta. The README also labels the package early alpha ([package peer dependencies](https://github.com/mcrovero/effect-nextjs/blob/784093caf5abd1ca2e48c558ca70ea0493c07d8b/package.json#L31-L34), [README warning](https://github.com/mcrovero/effect-nextjs/blob/784093caf5abd1ca2e48c558ca70ea0493c07d8b/README.md#L14-L22)). Its executor also imports Next's private `next/dist/client/components/unstable-rethrow.server.js`, so copying the pattern locally is safer than copying that implementation ([executor](https://github.com/mcrovero/effect-nextjs/blob/784093caf5abd1ca2e48c558ca70ea0493c07d8b/src/internal/executor.ts#L1-L4)).

## Where the current Commerce composition is off

[`makeCommerceApp`](../packages/commerce/runtime/make-commerce-app.ts) currently returns:

```ts
provide(request, program) =>
  program.pipe(Effect.provide(makeRequestLayer(bindings, request)))
```

That is Effect-native internally. The two problems are:

1. The two-argument method makes the Commerce object look like it owns the program. A curried pipeable provision function makes the actual operation clearer:

   ```ts
   program.pipe(CommerceApp.provide(request))
   ```

2. `makeRequestLayer` includes both request-specific services and closed provider layers. The Commercetools `cartsLayer`, `commerceAccountsLayer`, `addressBookLayer`, and product layer each provide their own `commercetoolsClientsLayer` internally. For example, [`cartsLayer`](../packages/commerce-commercetools/cart/carts.ts) and [`addressBookLayer`](../packages/commerce-commercetools/address-book/address-book.ts) close over the shared client layer independently. When the whole graph is first built inside a request provision, there is no application-lifetime observer holding those provider layers in the outer scope.

Layer memoization shares the same Layer object inside a live graph/scope; it is reference-based and observer-scoped. When the last observer's scope closes, the memo entry is removed and its resource scope is closed. It is therefore not a substitute for putting stable services in the application/runtime layer. See Effect v4's [`MemoMap` contract](https://github.com/Effect-TS/effect-smol/blob/6f38f07d5941a211b251383aaab0f4f55e8a6557/packages/effect/src/Layer.ts#L144-L205) and [entry lifecycle](https://github.com/Effect-TS/effect-smol/blob/6f38f07d5941a211b251383aaab0f4f55e8a6557/packages/effect/src/Layer.ts#L335-L400).

## Recommended composition

The provider/core seam should expose two layer levels, even if the concrete provider package hides its private service tags:

```ts
// Provider/app lifetime. No locale, user, cookie, or request identity here.
const CommerceStableLive: Layer.Layer<CommerceStableServices, StableError> =
  CommercetoolsProvider.live

// Request lifetime. It may require stable services from CommerceStableLive.
const CommerceRequestLive = (
  request: CommerceRequestInput
): Layer.Layer<
  CommerceRequestServices,
  CommerceRequestProvisionError,
  CommerceStableServices
> => makeCommerceRequestLayer(request)

const provideCommerce =
  (request: CommerceRequestInput) =>
  <A, E>(program: Effect.Effect<A, E, CommerceRequestServices>) =>
    program.pipe(Effect.provide(CommerceRequestLive(request)))
```

The exact `CommerceStableServices` union should remain inferred/private where possible. Conceptually it includes provider/config/client services and stable domain services such as `Carts`, `CommerceAccounts`, `CartPolicies`, and `CheckoutPolicies`. Request-derived services include `CommerceContext`, `CurrentCart`, `AddressBook`, `ProductDiscovery`, and `CheckoutSession` under the current model because their implementations capture request context.

This keeps the core Commerce API Effect-preserving. Each application then chooses its terminal boundary.

### Web application / Server Actions

```ts
// apps/web/lib/commerce-runtime.ts — module singleton
const CommerceRuntime = ManagedRuntime.make(CommerceStableLive)

const provideNextCommerce =
  (locale: Locale) =>
  <A, E>(program: Effect.Effect<A, E, CommerceRequestServices>) =>
    makeNextCommerceRequest(locale).pipe(
      Effect.flatMap((request) =>
        program.pipe(CommerceApp.provide(request))
      )
    )

export const NextCommerce = {
  provide: provideNextCommerce,
  runPromise: CommerceRuntime.runPromise
}
```

An add-to-cart action keeps all error mapping in Effect, including errors introduced while deriving and providing the request, and crosses into Promise exactly once:

```ts
const actionEffect = mutation.pipe(
  NextCommerce.provide(locale),
  Effect.catchTags(...),
  encodeActionResult(AddToCartActionResult)
)

return NextCommerce.runPromise(actionEffect)
```

A local `CommerceAction.build(handler)` can be added later if eliminating repeated action boilerplate is valuable. It would be our Effect v4 version of `Next.make(...).build(...)`: decode the action arguments, build the request input per invocation, provide the request layer, preserve Next control-flow errors, and run through the singleton runtime. It should remain an application boundary adapter, not a service required by domain programs.

### Effect HTTP application

`HttpRouter.toWebHandler` already implements the runtime-like behavior required by HTTP. It creates an application scope, lazily builds the supplied outer Layer once, caches the resulting handler/context, reuses it for requests, and returns a `dispose` function. See [`HttpEffect.toWebHandlerLayerWith`](https://github.com/Effect-TS/effect-smol/blob/6f38f07d5941a211b251383aaab0f4f55e8a6557/packages/effect/src/unstable/http/HttpEffect.ts#L287-L346) and [`HttpRouter.toWebHandler`](https://github.com/Effect-TS/effect-smol/blob/6f38f07d5941a211b251383aaab0f4f55e8a6557/packages/effect/src/unstable/http/HttpRouter.ts#L1249-L1316).

Therefore the API composition should look like:

```ts
const CheckoutHttpLive = makeCheckoutHttpApiLayer(...).pipe(
  Layer.provideMerge(CommerceStableLive)
)

const { handler, dispose } = HttpRouter.toWebHandler(CheckoutHttpLive)
```

Inside the existing checkout/auth middleware, request derivation remains Effect code:

```ts
const request = yield* makeHttpCommerceRequest(headers, authUserId)
return yield* httpEffect.pipe(CommerceApp.provide(request))
```

Do not call `CommerceRuntime.runPromise` there. That would introduce a nested Promise/runtime boundary inside an Effect HTTP program, weaken typed composition, and duplicate the lifecycle already owned by `toWebHandler`.

## Concrete decision

Keep the idea of `CommerceApp`, but change what it represents:

- `CommerceApp.provide(request)` is a data-last Effect transformer for request services.
- `CommerceStableLive` is the single provider-selected application Layer.
- `CommerceRuntime` is a web-app module singleton made from `CommerceStableLive`.
- `NextCommerce.runPromise` or `CommerceAction.build` is the Next-specific terminal adapter.
- The Effect HTTP app provides `CommerceStableLive` in its outer `toWebHandler` Layer and uses only `CommerceApp.provide(request)` inside request middleware.

This follows the same dependency direction as `effect-nextjs`, while preserving the important distinction its API can obscure: request provision is Effect composition; runtime execution is a terminal framework boundary.
